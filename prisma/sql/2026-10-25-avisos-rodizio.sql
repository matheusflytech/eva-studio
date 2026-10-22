-- Automações, parte D: avisos internos para a equipe e o rodízio de
-- responsável. Só aditivo, numa transação, RLS ligada sem política.
-- Sem estas tabelas: "Avisar a equipe" só manda o e-mail (se pedido) e o
-- rodízio vira "o primeiro da lista".
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_avisos" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "objeto" TEXT,
    "objetoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'automacao',
    "lidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_avisos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_avisos_userId_lidoEm_idx" ON "eva_studio_avisos"("userId", "lidoEm");
CREATE INDEX IF NOT EXISTS "eva_studio_avisos_orgId_createdAt_idx" ON "eva_studio_avisos"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "eva_studio_rodizios" (
    "chave" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contagem" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_rodizios_pkey" PRIMARY KEY ("chave")
);
CREATE INDEX IF NOT EXISTS "eva_studio_rodizios_orgId_idx" ON "eva_studio_rodizios"("orgId");

ALTER TABLE "eva_studio_avisos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_rodizios" ENABLE ROW LEVEL SECURITY;

COMMIT;
