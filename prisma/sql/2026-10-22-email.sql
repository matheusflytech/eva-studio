-- E-mail (F5): domínio/remetente do contrato, modelos, envios e supressão.
-- Só aditivo: tabelas novas, nada existente muda. Rodar numa transação.
-- Sem estas tabelas o app segue igual: as telas de e-mail avisam que falta
-- ativar e nenhum envio novo de e-mail acontece.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_email_dominios" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "registros" JSONB NOT NULL DEFAULT '[]',
    "remetenteNome" TEXT NOT NULL DEFAULT '',
    "remetenteLocal" TEXT NOT NULL DEFAULT 'contato',
    "responderPara" TEXT NOT NULL DEFAULT '',
    "verificadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_email_dominios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_email_dominios_orgId_key" ON "eva_studio_email_dominios"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_email_dominios_dominio_key" ON "eva_studio_email_dominios"("dominio");

CREATE TABLE IF NOT EXISTS "eva_studio_email_modelos" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assunto" TEXT NOT NULL DEFAULT '',
    "modo" TEXT NOT NULL DEFAULT 'simples',
    "corpo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_email_modelos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_email_modelos_orgId_idx" ON "eva_studio_email_modelos"("orgId");

CREATE TABLE IF NOT EXISTS "eva_studio_email_envios" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contactId" TEXT,
    "para" TEXT NOT NULL,
    "assunto" TEXT NOT NULL DEFAULT '',
    "resendId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "origem" TEXT NOT NULL DEFAULT 'teste',
    "refId" TEXT,
    "erro" TEXT,
    "abertoEm" TIMESTAMP(3),
    "clicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_email_envios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_email_envios_resendId_key" ON "eva_studio_email_envios"("resendId");
CREATE INDEX IF NOT EXISTS "eva_studio_email_envios_orgId_createdAt_idx" ON "eva_studio_email_envios"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_email_envios_contactId_idx" ON "eva_studio_email_envios"("contactId");

CREATE TABLE IF NOT EXISTS "eva_studio_email_supressoes" (
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_email_supressoes_pkey" PRIMARY KEY ("orgId", "email")
);

COMMIT;
