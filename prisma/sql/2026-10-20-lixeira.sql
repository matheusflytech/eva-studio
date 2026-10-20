-- Lixeira de 30 dias (item 2 de docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md).
--
-- Lixeira por "foto": apagar negócio, contato ou empresa grava aqui o registro
-- e tudo o que a cascata levaria junto (snapshot jsonb) e só então apaga de
-- verdade. Restaurar recria com os mesmos ids. Nenhuma tabela existente muda.
--
-- Só aditivo: UMA tabela nova. Idempotente (pode rodar de novo). Sem ela o
-- app continua apagando de forma definitiva, com aviso na tela e na API.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_trash" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "snapshot" JSONB NOT NULL,
    "deletedById" TEXT,
    "deletedByName" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_trash_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_trash_orgId_fkey') THEN
    ALTER TABLE "eva_studio_trash" ADD CONSTRAINT "eva_studio_trash_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_trash_entity_check') THEN
    ALTER TABLE "eva_studio_trash" ADD CONSTRAINT "eva_studio_trash_entity_check"
      CHECK ("entity" IN ('deal', 'contact', 'company'));
  END IF;
END $$;

-- Lista da tela (mais recentes primeiro, sempre por contrato).
CREATE INDEX IF NOT EXISTS "eva_studio_trash_orgId_deletedAt_idx" ON "eva_studio_trash"("orgId", "deletedAt");
-- Restaurar/achar a foto de um registro.
CREATE INDEX IF NOT EXISTS "eva_studio_trash_orgId_entity_entityId_idx" ON "eva_studio_trash"("orgId", "entity", "entityId");
-- Limpeza das vencidas pelo relógio (/api/internal/scheduler).
CREATE INDEX IF NOT EXISTS "eva_studio_trash_expiresAt_idx" ON "eva_studio_trash"("expiresAt");

COMMIT;
