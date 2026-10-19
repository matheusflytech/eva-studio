-- API pública v1 do CRM (fases API-0 a API-5). Só aditivo: uma coluna nova em
-- eva_studio_api_keys e cinco tabelas novas, nenhuma tocando as que já existem.
-- Escrito à mão a partir do schema.prisma (o diff do Prisma sugere derrubar o
-- índice vetorial, que fica de fora de propósito). Rodar numa transação,
-- ANTES do deploy do código que usa /api/v1 (o /api/v1/leads não depende disto).
BEGIN;

-- Escopos da chave. Chave antiga fica com "*" (tudo), como era antes.
ALTER TABLE "eva_studio_api_keys" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[];

CREATE TABLE IF NOT EXISTS "eva_studio_idempotency_keys" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_idempotency_keys_orgId_key_key" ON "eva_studio_idempotency_keys"("orgId", "key");
CREATE INDEX IF NOT EXISTS "eva_studio_idempotency_keys_createdAt_idx" ON "eva_studio_idempotency_keys"("createdAt");

CREATE TABLE IF NOT EXISTS "eva_studio_external_refs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "externalId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_external_refs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_external_refs_orgId_entity_source_externalId_key" ON "eva_studio_external_refs"("orgId", "entity", "source", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_external_refs_orgId_entity_source_entityId_key" ON "eva_studio_external_refs"("orgId", "entity", "source", "entityId");
CREATE INDEX IF NOT EXISTS "eva_studio_external_refs_orgId_entity_entityId_idx" ON "eva_studio_external_refs"("orgId", "entity", "entityId");

CREATE TABLE IF NOT EXISTS "eva_studio_deleted_records" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_deleted_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deleted_records_orgId_entity_deletedAt_idx" ON "eva_studio_deleted_records"("orgId", "entity", "deletedAt");

CREATE TABLE IF NOT EXISTS "eva_studio_bulk_jobs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "format" TEXT NOT NULL DEFAULT 'json',
    "mode" TEXT NOT NULL DEFAULT 'upsert',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL DEFAULT '{}',
    "records" JSONB,
    "inputText" TEXT,
    "filePath" TEXT,
    "cursor" TEXT NOT NULL DEFAULT '',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB NOT NULL DEFAULT '{}',
    "buffer" TEXT NOT NULL DEFAULT '',
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_bulk_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_bulk_jobs_orgId_kind_status_idx" ON "eva_studio_bulk_jobs"("orgId", "kind", "status");
CREATE INDEX IF NOT EXISTS "eva_studio_bulk_jobs_status_updatedAt_idx" ON "eva_studio_bulk_jobs"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "eva_studio_agent_flow_versions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'api',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_agent_flow_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_agent_flow_versions_agentId_createdAt_idx" ON "eva_studio_agent_flow_versions"("agentId", "createdAt");

COMMIT;
