# Endurecimento de Segurança — EVA Agent Studio

Data: 2026-09-15
Escopo: auditoria de segurança + correções aplicadas em toda a superfície de API, motor de fluxo, integrações Meta/Instagram e worker.

Validação: `npx tsc --noEmit`, `npx eslint` e `npm run build` — todos passam sem erros.
Diff: 21 arquivos, +468/−43. 6 arquivos novos em `src/lib/server/` + 1 rota nova.

---

## Antes de subir (passos obrigatórios)

1. **Migração do banco** — foi adicionado o model `RateLimit` (tabela `eva_studio_rate_limits`):
   ```bash
   npx prisma migrate dev --name add_rate_limit   # ou, em prod: npx prisma migrate deploy
   # alternativa rápida sem migration file: npx prisma db push
   ```

2. **Novas variáveis de ambiente**:
   | Variável | Onde | Obrigatória? | Para quê |
   |----------|------|--------------|----------|
   | `TOKEN_ENCRYPTION_KEY` | app (Vercel) | **Sim em produção** | Cifra os tokens de acesso Meta/Instagram em repouso. 32 bytes base64: `openssl rand -base64 32` |
   | `DATABASE_SSL_REJECT_UNAUTHORIZED` | worker (Railway) | Não (default `true`) | Só defina `false` se o Postgres usar cert self-signed sem CA disponível |
   | `DATABASE_SSL_CA` | worker | Não | CA do Postgres, se precisar validar cert privado |

   > Sem `TOKEN_ENCRYPTION_KEY` o app **continua funcionando** (grava tokens em texto puro, com aviso no log) — mas configure em produção. Linhas antigas em texto puro seguem legíveis e passam a ser cifradas no próximo update da conexão (migração sem downtime).

3. **Meta App Secret** — a verificação de assinatura do webhook usa `META_APP_SECRET` (já existente). Confirme que está setado; sem ele, o webhook rejeita todos os POSTs (era o comportamento de "não configurado" de antes).

---

## Correções por severidade

### 🔴 CRÍTICO

#### 1. Webhook da Meta sem verificação de assinatura
**Antes:** `POST /api/webhooks/meta` só checava se `META_APP_SECRET` existia; confiava no corpo sem validar. Qualquer um podia forjar eventos e fazer o bot enviar WhatsApp/Instagram usando os tokens reais da org, injetar conversas falsas e acionar automações.

**Depois:** valida o header `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru, comparação em tempo constante) antes de processar. Assinatura inválida → `401`.
- Novo: [`src/lib/server/meta-signature.ts`](src/lib/server/meta-signature.ts)
- Alterado: [`src/app/api/webhooks/meta/route.ts`](src/app/api/webhooks/meta/route.ts) — lê o corpo como texto cru (necessário pro HMAC bater), valida, depois faz o parse.

### 🟠 ALTO

#### 2. Endpoint público do widget sem rate limit
**Antes:** `POST /api/widget/[agentId]/message` era público, sem limite. O `agentId` vem embutido no `script.js` público → flood/abuso amplificava chamadas ao webhook/IA da org. `contactId` arbitrário permitia inflar o banco.

**Depois:** rate limit por IP+agente (20/min) e teto global por agente (600/min) → `429`. Validação de tamanho: `text` ≤ 4000, `contactId` ≤ 128, `optionId` ≤ 128, `lang` truncado a 8 chars.
- Novo: [`src/lib/server/rate-limit.ts`](src/lib/server/rate-limit.ts) (limiter de janela fixa no Postgres, atômico via `INSERT ... ON CONFLICT`, fail-open se o banco falhar)
- Alterado: [`src/app/api/widget/[agentId]/message/route.ts`](src/app/api/widget/[agentId]/message/route.ts)

#### 3. Registro aberto sem proteção
**Antes:** `POST /api/auth/signup` criava usuário+org sem rate limit, sem validar formato de e-mail nem força de senha.

**Depois:** rate limit 5/hora por IP → `429`; valida formato de e-mail e senha ≥ 8 caracteres.
- Alterado: [`src/app/api/auth/signup/route.ts`](src/app/api/auth/signup/route.ts)

> Decisão de produto pendente: manter o cadastro aberto ou exigir confirmação de e-mail/convite. Não alterei o `email_confirm: true` pra não quebrar seu onboarding — mas vale reavaliar (ver "Recomendações").

### 🟡 MÉDIO

#### 4. SSRF nos webhooks do fluxo
**Antes:** `flow-engine` fazia `fetch()` server-side em URLs configuradas pelo usuário (bloco "Chamar webhook" e webhook do agente) sem restrição — dava pra apontar pra `169.254.169.254` (metadados de nuvem), `localhost`, rede interna, e ler a resposta numa variável.

**Depois:** todo fetch de URL de usuário passa por `safeFetch`: só http/https, sem credenciais na URL, resolve DNS e **bloqueia IPs privados/loopback/link-local/reservados** (IPv4 e IPv6, incluindo IPv4-mapeado), timeout de 10s e **sem seguir redirect** (evita bypass via 302 pra IP interno).
- Novo: [`src/lib/server/ssrf.ts`](src/lib/server/ssrf.ts)
- Alterado: [`src/lib/server/flow-engine.ts`](src/lib/server/flow-engine.ts) (`callAgentWebhook` e bloco `webhook`)

#### 5. Tokens de acesso em texto puro no banco
**Antes:** `metaConnection.accessToken` e `instagramConnection.pageAccessToken` guardados em texto puro. Vazamento do banco = tomar as contas WhatsApp/Instagram conectadas.

**Depois:** cifrados em repouso com **AES-256-GCM** (chave `TOKEN_ENCRYPTION_KEY`). Cifra na escrita, decifra só no uso. Formato `enc:v1:...`; valores legados em texto puro continuam legíveis (compat retroativa).
- Novo: [`src/lib/server/crypto.ts`](src/lib/server/crypto.ts)
- Escrita cifrada: [`meta-connection/route.ts`](src/app/api/agents/[agentId]/meta-connection/route.ts), [`instagram-connection/route.ts`](src/app/api/agents/[agentId]/instagram-connection/route.ts), [`instagram/oauth/callback/route.ts`](src/app/api/instagram/oauth/callback/route.ts)
- Leitura decifrada: [`webhooks/meta/route.ts`](src/app/api/webhooks/meta/route.ts), [`broadcasts/route.ts`](src/app/api/agents/[agentId]/broadcasts/route.ts), [`conversations/[id]/reply/route.ts`](src/app/api/conversations/[id]/reply/route.ts)

#### 6. OAuth do Instagram sem proteção CSRF
**Antes:** o `state` carregava só o `agentId`, sem nonce ligado à sessão. Um atacante podia induzir a vítima logada a um callback que vinculava a conta Instagram do atacante ao agente da vítima.

**Depois:** novo fluxo passa por rota server-side que valida sessão/posse do agente, gera nonce aleatório e o guarda num cookie **httpOnly single-use (10min)** no formato `<agentId>|<nonce>`. O callback confere o nonce e confia no `agentId` do **cookie** (não do parâmetro da URL).
- Novo: [`src/app/api/instagram/oauth/start/route.ts`](src/app/api/instagram/oauth/start/route.ts)
- Alterado: [`callback/route.ts`](src/app/api/instagram/oauth/callback/route.ts), [`instagram-connect.tsx`](src/components/agent-studio/instagram-connect.tsx) (link agora aponta pra `/api/instagram/oauth/start`)

#### 7. Segredo interno comparado com `===`
**Antes:** `X-Internal-Secret` comparado com `===` (vaza tamanho do prefixo correto por timing).

**Depois:** comparação em tempo constante (`crypto.timingSafeEqual`).
- Novo: [`src/lib/server/secure-compare.ts`](src/lib/server/secure-compare.ts)
- Alterado: [`conversations/message/route.ts`](src/app/api/conversations/message/route.ts), [`leads/route.ts`](src/app/api/leads/route.ts)

### 🟢 BAIXO / defesa em profundidade

#### 8. TLS do banco no worker sem validação
**Antes:** `ssl: { rejectUnauthorized: false }` — aceitava qualquer cert (MITM).
**Depois:** valida por padrão; desligável só via `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (decisão consciente), com suporte a `DATABASE_SSL_CA`.
- Alterado: [`worker/index.js`](worker/index.js)

#### 9. Reentrega de webhook duplicava DM/resposta
**Antes:** a Meta pode reentregar o mesmo evento; não havia deduplicação.
**Depois:** idempotência por id de evento (mensagem WhatsApp / comentário Instagram), guardado 24h reusando a tabela de rate limit. Reentrega é ignorada.
- Alterado: [`webhooks/meta/route.ts`](src/app/api/webhooks/meta/route.ts)

#### 10. Prototype pollution via nome de variável
**Antes:** nomes de variável do Builder viravam chaves de objeto direto — `__proto__`/`constructor`/`prototype` poluiriam o prototype.
**Depois:** helper `setVar` bloqueia essas chaves em todas as atribuições do motor.
- Alterado: [`src/lib/server/flow-engine.ts`](src/lib/server/flow-engine.ts)

#### 11. `orgLogoUrl`/nomes sem validação no `PATCH /api/me`
**Antes:** `orgLogoUrl` gravado e renderizado sem validação (aceitava qualquer string; payload gigante).
**Depois:** exige `data:image/` ou `https://`, limita tamanho (logo ≤ 1.5MB, nomes ≤ 200 chars).
- Alterado: [`src/app/api/me/route.ts`](src/app/api/me/route.ts)

---

## O que já estava bom (mantido)

- **Autorização consistente:** toda rota org-scoped chama `requireOrgId()` + `findFirst({ id, orgId })`. Auditei todas as rotas `[agentId]`/`[id]` — **nenhum IDOR**.
- **SQL sem injection:** o `$queryRaw` em analytics usa template parametrizado.
- **Sem segredos commitados, sem `eval`/`dangerouslySetInnerHTML`/`child_process`.**
- **Widget em Shadow DOM**, mensagens via `textContent` (sem XSS).

---

## Recomendações futuras (não implementadas)

1. **Cifrar `creds`/`keys` do Baileys** no worker (mesmo esquema AES-GCM; exige a chave também no ambiente do worker). Hoje seguem em JSON puro no banco.
2. **Reavaliar o cadastro aberto** (#3): confirmação de e-mail real ou convite/allowlist, em vez de `email_confirm: true` automático via service-role.
3. **Rotação do `INTERNAL_API_SECRET`** e, idealmente, assinatura por requisição (HMAC do corpo + timestamp anti-replay) em vez de segredo estático compartilhado.
4. **Papéis dentro da org** (admin/membro) — hoje qualquer membro edita org, conexões e dispara campanhas.
5. **Rate limit no login** (hoje é o do Supabase) e observabilidade/alerta de abuso.
6. **Validação com `zod`** em todas as rotas (hoje é manual/pontual).
7. **Migrar o rate limiter pra Upstash/Redis** se o volume crescer muito (o de Postgres resolve bem no estágio atual).

---

## Arquivos novos

- `src/lib/server/crypto.ts` — AES-256-GCM para segredos em repouso
- `src/lib/server/ssrf.ts` — validação de URL + `safeFetch` anti-SSRF
- `src/lib/server/meta-signature.ts` — verificação HMAC do webhook Meta
- `src/lib/server/rate-limit.ts` — rate limiter (Postgres) + `getClientIp`
- `src/lib/server/secure-compare.ts` — comparação de segredos em tempo constante
- `src/app/api/instagram/oauth/start/route.ts` — início do OAuth com nonce anti-CSRF
