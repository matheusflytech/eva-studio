-- Histórico de alterações e auditoria (docs/superpowers/specs/2026-10-23-
-- historico-e-auditoria-design.md). Só aditivo, numa transação, RLS ligada
-- sem política. Sem esta tabela nada quebra: a ficha e a auditoria dizem que o
-- histórico ainda não está ativado. Guardado por 2 anos (varreduras.ts).
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_historico" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "objetoNome" TEXT NOT NULL DEFAULT '',
    "mudancas" JSONB,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "atorTipo" TEXT NOT NULL DEFAULT 'sistema',
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_historico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_historico_orgId_objeto_objetoId_createdAt_idx" ON "eva_studio_historico"("orgId", "objeto", "objetoId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_orgId_createdAt_idx" ON "eva_studio_historico"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_orgId_atorId_createdAt_idx" ON "eva_studio_historico"("orgId", "atorId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_createdAt_idx" ON "eva_studio_historico"("createdAt");

ALTER TABLE "eva_studio_historico" ENABLE ROW LEVEL SECURITY;

COMMIT;
