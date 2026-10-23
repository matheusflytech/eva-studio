-- Quadro de negócios v4: cada pessoa escolhe o que vê no cartão e no painel,
-- partindo do layout do funil (docs/superpowers/specs/2026-10-23-quadro-de-
-- negocios-v4-design.md). Só aditivo, numa transação, RLS ligada sem política.
-- Sem esta tabela vale o layout do funil e a personalização fica desligada.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_user_card_layouts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_user_card_layouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_user_card_layouts_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "eva_studio_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_user_card_layouts_userId_pipelineId_key" ON "eva_studio_user_card_layouts"("userId", "pipelineId");
CREATE INDEX IF NOT EXISTS "eva_studio_user_card_layouts_orgId_idx" ON "eva_studio_user_card_layouts"("orgId");

ALTER TABLE "eva_studio_user_card_layouts" ENABLE ROW LEVEL SECURITY;

COMMIT;
