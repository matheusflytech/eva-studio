-- Canais do contrato (F4 fase 2). Só aditivo: duas tabelas novas e cópia das
-- conexões que já existem; nenhuma tabela atual muda. Rodar numa transação.
-- Idempotente: rodar de novo não duplica (NOT EXISTS por agente + tipo).
-- Plano: docs/superpowers/plans/2026-10-21-canais-do-contrato.md
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_canais" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT,
    "segredos" TEXT,
    "status" TEXT NOT NULL DEFAULT 'conectado',
    "detalhe" TEXT,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_canais_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_canais_orgId_idx" ON "eva_studio_canais"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_canais_tipo_externalId_key"
  ON "eva_studio_canais"("tipo", "externalId") WHERE "externalId" IS NOT NULL;
-- Um agente atende no máximo um canal de cada tipo.
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_canais_agentId_tipo_key"
  ON "eva_studio_canais"("agentId", "tipo") WHERE "agentId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "eva_studio_canais_whatsapp_qr" (
    "canalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "qrDataUrl" TEXT,
    "phoneNumber" TEXT,
    "creds" JSONB,
    "keys" JSONB,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_canais_whatsapp_qr_pkey" PRIMARY KEY ("canalId")
);

-- Conexões de hoje viram canais do contrato, já atendidos pelo agente atual.
-- "segredos" fica nulo: as credenciais continuam na ativação (tabela do
-- agente) e o app copia na primeira troca. O SQL não decifra nada.

INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'whatsapp_meta', coalesce(c."displayPhone", c."phoneNumberId"), c."phoneNumberId", 'conectado', c."agentId", now()
FROM "eva_studio_meta_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'whatsapp_meta');

INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'instagram', coalesce('@' || c."username", c."igBusinessId"), c."igBusinessId", 'conectado', c."agentId", now()
FROM "eva_studio_instagram_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'instagram');

INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'messenger', coalesce(nullif(c."pageName", ''), c."pageId"), c."pageId", 'conectado', c."agentId", now()
FROM "eva_studio_messenger_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'messenger');

INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","detalhe","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'telegram', coalesce('@' || nullif(c."botUsername", ''), 'Bot do Telegram'), nullif(c."botUsername", ''),
       CASE WHEN c."webhookSet" THEN 'conectado' ELSE 'atencao' END, c."lastError", c."agentId", now()
FROM "eva_studio_telegram_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'telegram');

INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","detalhe","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'tiktok', coalesce(nullif(c."displayName", ''), 'Conta do TikTok'), c."businessId",
       CASE WHEN c."lastError" IS NULL THEN 'conectado' ELSE 'atencao' END, c."lastError", c."agentId", now()
FROM "eva_studio_tiktok_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'tiktok');

-- WhatsApp por QR: só as que não estão desconectadas. A sessão (creds/keys)
-- é copiada para a tabela nova, para o worker novo retomar sem pedir QR.
INSERT INTO "eva_studio_canais" ("id","orgId","tipo","rotulo","externalId","status","agentId","updatedAt")
SELECT gen_random_uuid()::text, a."orgId", 'whatsapp_qr', coalesce(c."phoneNumber", 'Número ainda não lido'), c."phoneNumber",
       CASE WHEN c."status" = 'connected' THEN 'conectado' ELSE 'pendente' END, c."agentId", now()
FROM "eva_studio_whatsapp_connections" c JOIN "eva_studio_agents" a ON a."id" = c."agentId"
WHERE c."status" <> 'disconnected'
  AND NOT EXISTS (SELECT 1 FROM "eva_studio_canais" x WHERE x."agentId" = c."agentId" AND x."tipo" = 'whatsapp_qr');

INSERT INTO "eva_studio_canais_whatsapp_qr" ("canalId","status","qrDataUrl","phoneNumber","creds","keys","lastError","updatedAt")
SELECT x."id", c."status", c."qrDataUrl", c."phoneNumber", c."creds", c."keys", c."lastError", now()
FROM "eva_studio_canais" x JOIN "eva_studio_whatsapp_connections" c ON c."agentId" = x."agentId"
WHERE x."tipo" = 'whatsapp_qr'
ON CONFLICT ("canalId") DO NOTHING;

COMMIT;

-- Conferência depois de aplicar (mesmos números das tabelas antigas):
-- select tipo, count(*) from eva_studio_canais group by tipo;
-- select count(*) from pg_indexes where indexdef ilike '%hnsw%';  -- = 1
