-- Fase 2 (lead de verdade): colunas de lead no contato. Só aditivo.
-- Gerado com `prisma migrate diff` e revisado à mão: o DROP INDEX do índice
-- vetorial que o diff sugere foi tirado de propósito (o Prisma não entende o
-- índice HNSW; ver prisma/post-migrate.mjs). Rodar numa transação.
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadStage" TEXT;
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadAt" TIMESTAMP(3);
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadAgentId" TEXT;
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadChannel" TEXT;
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_orgId_leadStage_idx" ON "eva_studio_contacts"("orgId", "leadStage");
