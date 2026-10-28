# Eva Studio — worker de WhatsApp (Baileys)

Processo separado, sempre ligado — o Baileys mantém um socket aberto com o WhatsApp, o que não roda em função
serverless da Vercel. Este worker só precisa da mesma `DATABASE_URL` do app principal; toda a comunicação entre
o app e o worker acontece através do banco (o worker faz polling a cada 4s) — não existe API própria além de
um health check em `/`.

**Sessão por canal (desde o SQL `prisma/sql/2026-10-22-canais-do-contrato.sql`).** Na subida o worker vê se
existe `eva_studio_canais_whatsapp_qr` (ver `fonte.js`):

- **Existe → modo canal.** Uma sessão por canal do contrato (Configurações → Canais). O agente que atende é
  lido em `eva_studio_canais` a cada mensagem, então trocar o agente na aba Canais não reinicia a sessão.
  Fila de saída e esperas acham a sessão pelo canal QR do agente. Canal sem agente: a mensagem vai para o
  app com `canalId` e só marca o aviso "recebendo mensagens sem agente".
- **Não existe → modo agente**, como sempre foi (`eva_studio_whatsapp_connections`, uma sessão por agente).

A migração do SQL copia as sessões abertas para a tabela nova; o worker novo retoma sem pedir QR. Ordem de
deploy: SQL → app → worker. Para voltar: reverter app e worker (as tabelas antigas continuam lá).

## Deploy

Hoje roda no Render (plano grátis, mantido acordado por ping externo). O passo a passo vale igual
para Railway.

1. Novo projeto → Deploy from GitHub repo → aponte pra este repositório, **root directory: `worker`**
2. Variáveis de ambiente — as quatro são obrigatórias, o processo **encerra na partida** sem elas:
   - `DATABASE_URL` — o mesmo banco da Vercel. No Render usamos o pooler em modo sessão (porta 5432).
   - `DATABASE_SSL_CA` — o certificado raiz do Supabase (`prod-ca-2021.crt`, em Supabase › Database ›
     Settings › SSL Configuration › Download certificate), colado inteiro, com as quebras de linha. Sem ele
     o worker cai na partida com `self-signed certificate in certificate chain`, porque valida o TLS do
     Postgres por padrão. Não é segredo. (Atalho menos seguro: `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.)
   - `EVA_STUDIO_URL` — a URL pública do app (hoje `https://evapp.vercel.app`), sem barra no fim.
     Conferir letra por letra: com a URL errada o WhatsApp conecta normal, mas a IA não responde
     (no log: `getaddrinfo ENOTFOUND`).
   - `INTERNAL_API_SECRET` — **idêntico** ao configurado no projeto da Vercel; é o que autentica o worker
     nas rotas internas. Valores diferentes nos dois lados fazem tudo responder 401 em silêncio.
   - Opcional, mas recomendado: `LOG_LEVEL=warn`. Em `info` o Baileys escreve no log do provedor o
     conteúdo das conversas.
3. Start command já vem do `package.json` (`npm start` → `node index.js`)
4. Sem porta fixa necessária — o worker escuta na porta que o provedor injetar (Render e Railway fazem isso)
5. Conferir no log: `Worker do WhatsApp por QR subindo` com `"modo":"canal"` e depois `WhatsApp conectado`.
   O erro `Timed Out ... init queries` logo depois de conectar é do Baileys e não atrapalha.

**Render (plano grátis).** Ele desliga o serviço depois de 15 min sem receber requisição, e o WhatsApp cai
junto. Manter um ping externo (UptimeRobot ou cron-job.org) em `https://eva-studio-whatsapp-worker.onrender.com`
a cada 10 min. O deploy automático estava desligado (em 23/10 o Render rodava código de um mês antes):
ligar em Settings › Auto-Deploy › On Commit, ou fazer Manual Deploy › Deploy latest commit depois de cada
merge que mexe em `worker/`.

## Cuidados (aprendidos em 23/10/2026)

- **Um worker só no ar.** Dois workers no mesmo banco abrem duas sessões para o mesmo canal, gravam QRs
  diferentes e um sobrescreve as credenciais do outro no pareamento (o celular diz "não é possível conectar").
  Antes de subir em outro lugar (Railway, local), desligue o que está rodando.
- **Worker parado não dá erro na tela de antes.** Em 21/10 o worker do Render parou (em 23/10 vimos que
  não havia log nenhum em 7 dias: ping externo parado e código de um mês atrás) e o QR que ficou no banco
  continuou na tela por dois dias; escanear dava "não é possível conectar". Agora Configurações → Canais avisa
  quando a sessão espera QR sem mudança há mais de 3 minutos.
- **Códigos de desconexão.** 408 (QR expirou) e 515 (reinício pedido logo depois de parear) são normais e não
  viram aviso. Qualquer outro fica em `lastError` como "Conexão caiu (código N)".

## O que o worker faz

- **Sessão do Baileys** por canal do contrato (ou por agente, sem o SQL de canais), com QR e reconexão (polling de 4s)
- **Fila de saída**: resposta de atendente e disparo por WhatsApp via QR
- **Esperas vencidas**: retoma conversa parada num bloco Esperar
- **Relógio do produto** (`tickScheduler`, a cada 60s): chama `/api/internal/scheduler` no app, que entrega
  os passos de sequência vencidos e os disparos agendados.

  **Desde 28/09/2026 este não é mais o relógio principal.** Ele virou reserva: o relógio de verdade é o
  `pg_cron` dentro do Postgres do Supabase (`prisma/relogio.sql`), que não depende de nenhum processo
  ficar acordado. Os dois batendo juntos não duplicam entrega — a rota tem trava de 45s
  (`tentarTravarRelogio` em `src/lib/server/heartbeat.ts`) e o segundo a chegar recebe
  `{skipped:true}` sem entregar nada.

  O motivo da troca: o worker no plano grátis do Render hiberna, precisa de ping externo pra acordar, e
  quando o deploy automático não dispara ele fica rodando código velho — foi exatamente o que aconteceu.
  Sequência parada em silêncio é o pior modo de falha que existe, porque ninguém percebe.

## Rodando local pra testar

**Desligue o worker do Render antes** (ver "Um worker só no ar"). Com o app rodando local em `:3100`:

```bash
cd worker
npm install
EVA_STUDIO_URL=http://localhost:3100 LOG_LEVEL=warn DATABASE_SSL_REJECT_UNAUTHORIZED=false PORT=3311 \
  node --env-file=../.env.local index.js
```

Aponte para o app local, não para a Vercel: o `INTERNAL_API_SECRET` do `.env.local` é diferente do de
produção e tudo responderia 401. Depois é só clicar em "Conectar" em Configurações › Canais — o worker
detecta o pedido (polling) e gera o QR em até ~4s. Ao terminar, pare o processo e religue o do Render.
