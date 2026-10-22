-- Personalização do cartão do negócio por funil. Só aditivo: tabela nova,
-- nada existente muda. Rodar numa transação.
CREATE TABLE IF NOT EXISTS "eva_studio_pipeline_card_layouts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_pipeline_card_layouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_pipeline_card_layouts_pipelineId_key" ON "eva_studio_pipeline_card_layouts"("pipelineId");
CREATE INDEX IF NOT EXISTS "eva_studio_pipeline_card_layouts_orgId_idx" ON "eva_studio_pipeline_card_layouts"("orgId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_pipeline_card_layouts_pipelineId_fkey') THEN
    ALTER TABLE "eva_studio_pipeline_card_layouts" ADD CONSTRAINT "eva_studio_pipeline_card_layouts_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES "eva_studio_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
