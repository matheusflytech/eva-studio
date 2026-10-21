# Canais do contrato (F4, fase 2) — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development ou
> superpowers:executing-plans, tarefa por tarefa. Passos com `- [ ]`.

**Objetivo:** as conexões de canal (BM/WhatsApp oficial, WhatsApp por QR,
Instagram, Messenger, Telegram, TikTok) passam a ser do **contrato**:
Configurações → Canais só conecta e desconecta. O **agente** escolhe, na aba
dele, por quais canais atende.

**Decisões do Alfredo (21/10/2026):**
- Configurações → Canais é só conexão; nada de escolher agente ali.
- O contrato pode ter vários canais do mesmo tipo (vários números, vários
  Instagrams).
- Cada canal é atendido por **um** agente (nunca duas IAs no mesmo cliente).
- WhatsApp por QR e TikTok entram já, mudando o worker.
- Sem mexer nas tabelas que existem: SQL só aditivo.

**Suposição a confirmar:** um agente atende no máximo **um canal de cada
tipo** (ex.: um WhatsApp oficial + um Instagram). Motivo: a conversa é única
por `(agentId, channel, contactId)` e os envios acham a conexão pelo agente;
um agente com dois números do mesmo tipo exige `canalId` na conversa e em
todos os envios (fase 3). Empresas com dois números usam dois agentes.

---

## Arquitetura

```
Configurações → Canais            Aba Canais do agente
  conecta / desconecta              escolhe quais canais usa
        │                                   │
        ▼                                   ▼
 eva_studio_canais  ── agentId (quem atende, nulo = ninguém) ──┐
 (fonte da verdade: credenciais cifradas, número/conta, status)│
        │ ativar/desativar                                      │
        ▼                                                       │
 tabelas por agente de hoje (MetaConnection, InstagramConnection, ...)
 = "ativação": cópia das credenciais para o agente que atende.
 Entrada, envios, disparos e réguas continuam lendo daqui, sem mudança.
```

- **Canal sem agente** só existe em `eva_studio_canais`. Mensagem que chega
  nele é recebida e guardada para o inbox, sem resposta do bot (ver Tarefa 6).
- **Ativar** (agente escolhe o canal): grava/atualiza a linha da tabela do
  agente com as credenciais do canal e põe `canal.agentId`. Se o agente já
  tinha outro canal daquele tipo, aquele é desativado antes.
- **Desativar** (agente tira, ou outro agente pega): apaga a linha da tabela
  do agente; o canal continua conectado no contrato.
- **WhatsApp por QR:** a sessão sai do agente. O worker passa a abrir uma
  sessão **por canal** (`eva_studio_canais.id`), lendo `creds`/`keys`/`qr` de
  uma tabela nova `eva_studio_canais_whatsapp_qr`. Entrada do worker manda
  `canalId`; o app descobre o agente pelo canal. Fila de saída: o worker acha
  a sessão do agente pelo canal ativo dele.
- **TikTok:** o webhook passa a ter uma rota por canal
  (`/api/webhooks/tiktok/canal/[canalId]`); a rota antiga por agente continua
  respondendo (compatibilidade).
- **Telegram:** o webhook passa a ser por canal
  (`/api/webhooks/telegram/canal/[canalId]`), registrado uma vez ao
  conectar; trocar de agente não precisa mais recadastrar. A rota antiga por
  agente continua.

## Banco (SQL aditivo, `prisma/sql/2026-10-22-canais-do-contrato.sql`)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_canais" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,              -- whatsapp_meta | whatsapp_qr | instagram | messenger | telegram | tiktok
    "rotulo" TEXT NOT NULL DEFAULT '', -- número, @conta, página, bot
    "externalId" TEXT,                 -- phoneNumberId | igBusinessId | pageId | bot id | businessId | número do QR
    "segredos" TEXT,                   -- JSON cifrado (crypto.ts): token, wabaId, refresh...
    "status" TEXT NOT NULL DEFAULT 'conectado', -- conectado | atencao | pendente | desconectado
    "detalhe" TEXT,
    "agentId" TEXT,                    -- quem atende; nulo = ninguém
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_canais_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_canais_orgId_idx" ON "eva_studio_canais"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_canais_tipo_externalId_key"
  ON "eva_studio_canais"("tipo", "externalId") WHERE "externalId" IS NOT NULL;
-- Um agente, no máximo um canal por tipo (ver "Suposição").
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_canais_agentId_tipo_key"
  ON "eva_studio_canais"("agentId", "tipo") WHERE "agentId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "eva_studio_canais_whatsapp_qr" (
    "canalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected', -- disconnected | requesting | qr_pending | connected | logging_out
    "qrDataUrl" TEXT,
    "phoneNumber" TEXT,
    "creds" JSONB,
    "keys" JSONB,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_canais_whatsapp_qr_pkey" PRIMARY KEY ("canalId")
);

-- Migração das conexões que já existem: cada uma vira um canal do contrato,
-- já atendido pelo agente onde está hoje. Idempotente (ON CONFLICT).
INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","segredos","status","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'whatsapp_meta', coalesce(m."displayPhone", m."phoneNumberId"), m."phoneNumberId", NULL, 'conectado', m."agentId", now()
FROM "eva_studio_meta_connections" m JOIN "eva_studio_agents" a ON a.id = m."agentId"
ON CONFLICT DO NOTHING;
-- (idem para instagram, messenger, telegram, tiktok; whatsapp_qr só com status <> 'disconnected')
-- QR: copia creds/keys para eva_studio_canais_whatsapp_qr, para o worker
-- retomar a sessão sem pedir QR de novo.

COMMIT;
```

`segredos` nulo na migração = as credenciais continuam só na tabela do agente
(a ativação existente); na primeira troca de agente o app copia de lá para o
canal. Assim o SQL não precisa decifrar nada.

## Ordem de deploy e volta

1. Aplicar o SQL (com OK do Alfredo), conferir HNSW e as contagens: número de
   canais = número de conexões de hoje.
2. Deploy do app (lê `eva_studio_canais` com leitura tolerante; sem a tabela,
   cai no comportamento de hoje).
3. Deploy do worker novo no Render. O worker novo lê
   `eva_studio_canais_whatsapp_qr`; se a tabela não existir, continua no modo
   antigo (por agente).
4. **Volta:** reverter app e worker; as tabelas antigas nunca deixaram de ser
   escritas (ativação), então tudo volta a funcionar como hoje.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | models `Canal` e `CanalWhatsAppQr` |
| `prisma/sql/2026-10-22-canais-do-contrato.sql` | tabelas + migração |
| `src/lib/canais.ts` | catálogo (já existe; tira `trocaDireta`) |
| `src/lib/server/canais/repositorio.ts` | ler/listar canais, leitura tolerante |
| `src/lib/server/canais/ativacao.ts` | ativar/desativar canal num agente (cópia para a tabela do agente) |
| `src/lib/server/canais/conectar-*.ts` | conectar no contrato, por tipo (reaproveita a lógica das rotas por agente) |
| `src/app/api/canais/*` | listar, conectar, desconectar (contrato) |
| `src/app/api/agents/[agentId]/canais/route.ts` | agente escolhe/tira canais |
| `src/app/api/webhooks/telegram/canal/[canalId]/route.ts` | entrada do Telegram por canal |
| `src/app/api/webhooks/tiktok/canal/[canalId]/route.ts` | entrada do TikTok por canal |
| `src/app/api/whatsapp/canal/[canalId]/route.ts` | QR do contrato (pedir/ler status/desconectar) |
| `src/app/api/conversations/message/route.ts` | aceita `canalId` do worker |
| `worker/auth-store.js`, `worker/index.js`, `worker/fila.js` | sessão por canal |
| `src/components/configuracoes/aba-canais.tsx` | só conectar/desconectar |
| `src/components/agent-studio/canais-do-agente.tsx` | escolher canais |

## Tarefas

### Tarefa 1: Banco
- [ ] Models no schema (`Canal` → `eva_studio_canais`, `CanalWhatsAppQr` →
  `eva_studio_canais_whatsapp_qr`), sem relação com as tabelas antigas.
- [ ] SQL completo (todas as migrações por tipo) em
  `prisma/sql/2026-10-22-canais-do-contrato.sql`.
- [ ] `npx prisma generate`, `npx tsc --noEmit -p .`. Commit.

### Tarefa 2: Repositório e ativação (TDD, Vitest com Prisma mockado)
- [ ] Testes de `ativacao.ts`:
  - ativar Instagram no agente A: cria `InstagramConnection(agentId=A)` com
    token decifrado do canal e põe `canal.agentId = A`;
  - ativar quando A já tem outro Instagram: desativa o anterior antes;
  - ativar canal que estava com B: apaga a linha de B, cria a de A;
  - desativar: apaga a linha do agente, `canal.agentId = null`, canal segue;
  - canal migrado com `segredos` nulo: copia da linha atual do agente para o
    canal antes de mover;
  - canal de outro contrato: recusa.
- [ ] Implementar. Commit.

### Tarefa 3: Conectar no contrato (por tipo)
- [ ] Telegram: `getMe` + `setWebhook` para `/api/webhooks/telegram/canal/<id>`;
  rota nova de entrada que acha o canal, o agente e chama o mesmo handler.
- [ ] Instagram: OAuth com o state levando `canal` (não agente); callback
  cria/atualiza o canal e volta para Configurações → Canais.
- [ ] WhatsApp oficial (Embedded Signup): grava o canal (phoneNumberId,
  wabaId, token cifrado). Webhook da Meta: sem mudança (acha a ativação por
  phoneNumberId); canal sem agente → Tarefa 6.
- [ ] Messenger e TikTok: idem, com a rota de entrada do TikTok por canal.
- [ ] Testes de cada rota (corpo inválido, outro contrato, sucesso). Commit
  por tipo.

### Tarefa 4: Worker por canal (WhatsApp QR)
- [ ] `auth-store.js`: `loadAuthState(pool, chave)` com
  `{ tabela, coluna }` — modo novo lê `eva_studio_canais_whatsapp_qr` por
  `canalId`; modo antigo inalterado.
- [ ] `index.js`: `sessions` por canal; `pollForWork`/`resume` leem a tabela
  nova (se existir); `advanceViaEngine` manda `canalId`; mídia manda `canalId`.
- [ ] `fila.js`: item da fila tem `agentId`; o worker acha o canal QR ativo
  do agente (`select id from eva_studio_canais where "agentId"=$1 and tipo='whatsapp_qr'`).
- [ ] App: `/api/conversations/message` e `/api/internal/media` aceitam
  `canalId` e resolvem o agente; canal sem agente → Tarefa 6.
- [ ] Teste manual só com o agente "teste" e um número de teste. Commit.

### Tarefa 5: Telas
- [ ] Configurações → Canais: por tipo, lista os canais (logo, rótulo,
  situação, "usado por: Agente X" só como informação), **Conectar** e
  **Desconectar**. Nada de escolher agente.
- [ ] Aba Canais do agente: por tipo, um seletor "Nenhum / canais do
  contrato desse tipo"; escolher um que está com outro agente pede
  confirmação ("sai do Agente X"). Link para conectar em Configurações.
- [ ] Conferir no navegador nos dois temas. Commit.

### Tarefa 6: Canal sem agente
- [ ] Mensagem que chega num canal sem agente: registra a mensagem no inbox
  (Conversas) como "sem agente", sem resposta automática; Início mostra
  "canal sem agente recebendo mensagens".
- [ ] Teste do motor. Commit.

### Tarefa 7: Docs e grafo
- [ ] HANDOFF (SQL novo, ordem de deploy, volta), CHATBOT_ENGINE §canais,
  `worker/README.md`. `graphify update .`. Commit.

## Riscos

- **Worker em produção:** a sessão QR do "Vendedor Virtual" está em
  `qr_pending`; a migração copia creds e o worker novo retoma. Testar antes
  com o agente "teste".
- **Instagram:** CommentAutomation e AgentTrigger seguem no agente; ao trocar
  o agente do Instagram, as automações do anterior param de valer (aviso na
  tela).
- **Templates da Meta:** continuam por agente (fase 3: por WABA).
