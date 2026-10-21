-- Webhooks de saída (F6): endpoints do contrato e a fila de entregas.
-- Só aditivo: tabelas novas, nada existente muda. Rodar numa transação.
-- Sem estas tabelas o app segue igual: nenhum evento é emitido e a tela de
-- webhooks avisa que falta ativar.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_webhook_endpoints" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "eventos" TEXT[],
    "segredo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "origem" TEXT NOT NULL DEFAULT 'tela',
    "desativadoPor" TEXT,
    "falhandoDesde" TIMESTAMP(3),
    "ultimoSucesso" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_webhook_endpoints_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_webhook_endpoints_orgId_idx" ON "eva_studio_webhook_endpoints"("orgId");

CREATE TABLE IF NOT EXISTS "eva_studio_webhook_entregas" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoStatus" INTEGER,
    "ultimaResposta" TEXT,
    "latenciaMs" INTEGER,
    "entregueEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_webhook_entregas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_webhook_entregas_status_proximaEm_idx" ON "eva_studio_webhook_entregas"("status", "proximaEm");
CREATE INDEX IF NOT EXISTS "eva_studio_webhook_entregas_endpointId_createdAt_idx" ON "eva_studio_webhook_entregas"("endpointId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "eva_studio_webhook_entregas"
    ADD CONSTRAINT "eva_studio_webhook_entregas_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "eva_studio_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
