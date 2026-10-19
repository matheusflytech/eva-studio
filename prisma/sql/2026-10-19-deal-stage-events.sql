-- Dashboards do funil: histórico de mudança de etapa. Só aditivo.
-- Gerado com `prisma migrate diff` e revisado à mão: o DROP INDEX do índice
-- vetorial que o diff sugere foi tirado de propósito. Rodar numa transação.
CREATE TABLE IF NOT EXISTS "eva_studio_deal_stage_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'usuario',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_deal_stage_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_stage_events_orgId_pipelineId_at_idx" ON "eva_studio_deal_stage_events"("orgId", "pipelineId", "at");
CREATE INDEX IF NOT EXISTS "eva_studio_deal_stage_events_dealId_at_idx" ON "eva_studio_deal_stage_events"("dealId", "at");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_stage_events_dealId_fkey') THEN
    ALTER TABLE "eva_studio_deal_stage_events" ADD CONSTRAINT "eva_studio_deal_stage_events_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
