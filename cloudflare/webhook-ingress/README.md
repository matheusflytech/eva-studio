# eva-webhook-ingress

Worker da Cloudflare que fica **na frente** dos webhooks de entrada do Eva
Studio (Meta: WhatsApp/Instagram/Messenger, Telegram, TikTok). Arquitetura
completa e decisão: [`docs/arquitetura-cloudflare.md`](../../docs/arquitetura-cloudflare.md).

```
Meta / Telegram / TikTok
        │  POST (mesmo caminho do app: /api/webhooks/...)
        ▼
┌─────────────── Worker (fetch) ───────────────┐
│ 1. valida origem (HMAC Meta / secret token)  │
│ 2. dedupe por id do evento (KV, TTL 7 dias)  │
│ 3. enfileira o corpo CRU (Queue)             │
│ 4. responde 200 em milissegundos             │
└───────────────────────┬──────────────────────┘
                        ▼  eva-webhooks-entrada
┌─────────────── Worker (queue) ───────────────┐
│ POST {APP_URL}/api/internal/webhooks         │
│  x-eva-timestamp + x-eva-signature (HMAC)    │
│ 2xx → ack · 5xx/429/rede → retry exponencial │
│ 4xx → fila morta (eva-webhooks-dlq)          │
└───────────────────────┬──────────────────────┘
                        ▼
App Next (Vercel): /api/internal/webhooks confere o HMAC e chama
os MESMOS handlers de /api/webhooks/{meta,telegram,tiktok}.
```

## O que tem aqui

| Arquivo | Papel |
|---|---|
| `src/index.ts` | Entrada do Worker (`fetch` + `queue`) |
| `src/entrada.ts` | Validação, dedupe, enfileiramento, handshakes GET |
| `src/consumidor.ts` | Entrega ao app com retry e fila morta |
| `src/entrega.ts` | Chamada assinada ao app, classificação de status, backoff |
| `src/assinatura.ts` | HMAC (Web Crypto), comparação em tempo constante |
| `src/dedupe.ts` | Chave de dedupe por origem (wamid, mid, update_id…) |
| `src/rotas.ts` | Caminhos aceitos (iguais aos do app) |
| `test/` | Vitest rodando no workerd (`@cloudflare/vitest-plugin`) |

Pacote **independente** do app: tem `package.json` próprio e não mexe no da raiz.

## Rodar os testes

```bash
cd cloudflare/webhook-ingress
npm install
npm test          # vitest dentro do runtime da Cloudflare
npm run typecheck
```

## Variáveis e segredos

| Nome | Tipo | Onde | Valor |
|---|---|---|---|
| `APP_URL` | var | `wrangler.jsonc` | `https://<app>.vercel.app` (sem barra no fim) |
| `META_APP_SECRET` | segredo | `wrangler secret put` | **o mesmo** App Secret do app (Vercel) |
| `META_WEBHOOK_VERIFY_TOKEN` | segredo | `wrangler secret put` | o mesmo verify token do app |
| `TELEGRAM_SECRET_TOKEN` | segredo | `wrangler secret put` | o valor de `INTERNAL_API_SECRET` do app (é o `secret_token` registrado no `setWebhook`) |
| `TIKTOK_WEBHOOK_TOKEN` | segredo | `wrangler secret put` | o valor de `INTERNAL_API_SECRET` do app (o `?token=` da URL de callback) |
| `INGRESS_SIGNING_SECRET` | segredo | `wrangler secret put` **e** env da Vercel | segredo novo, só entre Worker e app (`openssl rand -hex 32`) |

Nenhum segredo vai em arquivo versionado. Para `wrangler dev` local, copie
`.dev.vars.example` para `.dev.vars` (ignorado pelo git).

## Deploy (feito pelo dono da conta — nada disso foi executado)

```bash
cd cloudflare/webhook-ingress
npx wrangler login

# 1. recursos (uma vez)
npx wrangler kv namespace create DEDUPE          # copie o id para wrangler.jsonc
npx wrangler queues create eva-webhooks-entrada
npx wrangler queues create eva-webhooks-dlq

# 2. ajuste APP_URL e o id do KV em wrangler.jsonc

# 3. segredos
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_WEBHOOK_VERIFY_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put TIKTOK_WEBHOOK_TOKEN
npx wrangler secret put INGRESS_SIGNING_SECRET

# 4. no app (Vercel): adicionar INGRESS_SIGNING_SECRET com o mesmo valor e
#    publicar a versão que tem /api/internal/webhooks

# 5. publicar o Worker
npx wrangler deploy
```

Opcional: rota num domínio próprio (ex. `hooks.seudominio.com.br`) em
*Workers → Settings → Domains & Routes*. Sem domínio, a URL
`https://eva-webhook-ingress.<conta>.workers.dev` já funciona.

Conferência rápida depois do deploy:

```bash
curl https://<worker>/health                                   # {"ok":true}
curl "https://<worker>/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=42"   # 42
```

## Ligar e desligar (troca reversível)

As rotas antigas do app **continuam funcionando** o tempo todo. Ligar é só
apontar o callback para o Worker; desligar é apontar de volta. O caminho é o
mesmo, muda só o domínio.

**Meta (WhatsApp/Instagram/Messenger)** — App Dashboard → *WhatsApp →
Configuration* (e *Webhooks* para Instagram/Page):

1. *Callback URL*: `https://<worker>/api/webhooks/meta`, *Verify token*: o
   mesmo. Ao salvar, a Meta faz o GET de verificação — o Worker responde.
2. Os campos assinados (messages, statuses, templates, comments) não mudam.
3. Acompanhe `npx wrangler tail` e a caixa de entrada do app por alguns minutos.

Voltar: trocar a *Callback URL* para `https://<app>/api/webhooks/meta`. Nada
mais precisa mudar. Se quiser testar antes num número só, use um **app Meta de
teste** apontado para o Worker, mantendo o de produção no app.

**Telegram** — por bot:

```bash
# ligar
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url=https://<worker>/api/webhooks/telegram/<agentId> \
  -d secret_token=<INTERNAL_API_SECRET>
# voltar
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url=https://<app>/api/webhooks/telegram/<agentId> \
  -d secret_token=<INTERNAL_API_SECRET>
```

**TikTok** — no portal, trocar o callback para
`https://<worker>/api/webhooks/tiktok/<agentId>?token=<INTERNAL_API_SECRET>`
(e de volta para o domínio do app).

## Comportamento que vale saber

- **200 rápido:** o Worker não toca no banco nem no motor de fluxo; só valida,
  consulta o KV e enfileira.
- **Ordem:** marca "visto" só depois que a fila aceitou. Se a fila falhar,
  responde 500 e a origem re-tenta.
- **Dedupe é de melhor esforço:** o KV leva até ~60 s para propagar entre
  regiões. A rota da Meta no app continua com o próprio dedupe
  (`isFirstDelivery`) como segunda linha. Telegram e TikTok não têm dedupe no
  app — uma entrega repetida pelo retry da fila (timeout do app depois de ter
  processado) pode gerar resposta dupla nesses dois canais.
- **Retry:** 30 s, 1 min, 2 min… até 1 h (±20%), `Retry-After` respeitado,
  20 tentativas (~15 h) e depois fila morta. 4xx do app vai direto para a
  fila morta.
- **Fila morta:** sem consumidor de propósito — fica retida (4 dias no plano
  pago, configurável até 14). Para reprocessar: painel *Queues →
  eva-webhooks-dlq → Messages*, ou um consumidor temporário apontando para
  `tratarLote`.
- **Corpo grande (>120 KB):** não cabe na fila; o Worker entrega direto ao app
  e espera (502 se o app falhar, e a origem re-tenta).
- **Sem configuração:** segredo faltando responde 503 (visível), nunca 200
  calado.
