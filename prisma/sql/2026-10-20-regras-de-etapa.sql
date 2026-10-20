-- Regras por etapa (item 1 de docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md):
-- campos obrigatórios ao entrar na etapa, "pode ser pulada", prazo de parado
-- (rottingDays), orientação da etapa, motivos de perda por funil, motivo
-- estruturado da perda e última atividade do negócio.
--
-- Só aditivo: quatro tabelas novas e UMA coluna nova com default em
-- eva_studio_deal_stage_events. Nada é apagado nem renomeado. Idempotente
-- (pode rodar de novo). O app funciona antes disto: sem as tabelas, vale o
-- padrão (7 dias para parado nas etapas abertas, motivos padrão, nenhum campo
-- obrigatório).
BEGIN;

-- 1) Regras da etapa ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "eva_studio_pipeline_stage_rules" (
    "stageId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "canBeSkipped" BOOLEAN NOT NULL DEFAULT true,
    "rottingDays" INTEGER,
    "guidance" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_pipeline_stage_rules_pkey" PRIMARY KEY ("stageId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_pipeline_stage_rules_pipelineId_idx" ON "eva_studio_pipeline_stage_rules"("pipelineId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_pipeline_stage_rules_stageId_fkey') THEN
    ALTER TABLE "eva_studio_pipeline_stage_rules" ADD CONSTRAINT "eva_studio_pipeline_stage_rules_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "eva_studio_pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_pipeline_stage_rules_rottingDays_check') THEN
    ALTER TABLE "eva_studio_pipeline_stage_rules" ADD CONSTRAINT "eva_studio_pipeline_stage_rules_rottingDays_check"
      CHECK ("rottingDays" IS NULL OR ("rottingDays" BETWEEN 1 AND 365));
  END IF;
END $$;

-- Backfill: mantém o comportamento de hoje (parado = 7 dias em toda etapa aberta).
INSERT INTO "eva_studio_pipeline_stage_rules" ("stageId", "orgId", "pipelineId", "requiredFields", "canBeSkipped", "rottingDays", "guidance", "updatedAt")
SELECT s."id", p."orgId", s."pipelineId", '[]'::jsonb, true,
       CASE WHEN s."type" = 'open' THEN 7 ELSE NULL END, '', CURRENT_TIMESTAMP
FROM "eva_studio_pipeline_stages" s
JOIN "eva_studio_pipelines" p ON p."id" = s."pipelineId"
ON CONFLICT ("stageId") DO NOTHING;

-- 2) Motivos de perda por funil ---------------------------------------------
CREATE TABLE IF NOT EXISTS "eva_studio_pipeline_lost_reasons" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiresNote" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_pipeline_lost_reasons_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_pipeline_lost_reasons_pipelineId_position_idx" ON "eva_studio_pipeline_lost_reasons"("pipelineId", "position");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_pipeline_lost_reasons_pipelineId_fkey') THEN
    ALTER TABLE "eva_studio_pipeline_lost_reasons" ADD CONSTRAINT "eva_studio_pipeline_lost_reasons_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES "eva_studio_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: os seis motivos padrão em cada funil que ainda não tem nenhum.
-- (gen_random_uuid() é nativo do Postgres 13+.)
INSERT INTO "eva_studio_pipeline_lost_reasons" ("id", "orgId", "pipelineId", "label", "requiresNote", "position", "createdAt")
SELECT gen_random_uuid()::text, p."orgId", p."id", m.label, m.nota, m.pos, CURRENT_TIMESTAMP
FROM "eva_studio_pipelines" p
CROSS JOIN (VALUES
    ('Preço', false, 0),
    ('Escolheu concorrente', false, 1),
    ('Sem resposta', false, 2),
    ('Sem orçamento', false, 3),
    ('Timing', false, 4),
    ('Outro', true, 5)
) AS m(label, nota, pos)
WHERE NOT EXISTS (SELECT 1 FROM "eva_studio_pipeline_lost_reasons" r WHERE r."pipelineId" = p."id");

-- 3) Motivo estruturado da perda ----------------------------------------------
CREATE TABLE IF NOT EXISTS "eva_studio_deal_losses" (
    "dealId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "reasonId" TEXT,
    "reasonLabel" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "lostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_deal_losses_pkey" PRIMARY KEY ("dealId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_losses_orgId_pipelineId_reasonLabel_idx" ON "eva_studio_deal_losses"("orgId", "pipelineId", "reasonLabel");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_losses_dealId_fkey') THEN
    ALTER TABLE "eva_studio_deal_losses" ADD CONSTRAINT "eva_studio_deal_losses_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: perdidos de hoje cujo texto bate (sem maiúsculas/espaços) com um
-- motivo do funil viram estruturados; o resto fica só com o texto antigo.
INSERT INTO "eva_studio_deal_losses" ("dealId", "orgId", "pipelineId", "reasonId", "reasonLabel", "note", "lostAt")
SELECT d."id", d."orgId", d."pipelineId", r."id", r."label", '', COALESCE(d."closedAt", d."updatedAt")
FROM "eva_studio_deals" d
JOIN "eva_studio_pipeline_stages" s ON s."id" = d."stageId" AND s."type" = 'lost'
JOIN "eva_studio_pipeline_lost_reasons" r ON r."pipelineId" = d."pipelineId"
  AND lower(btrim(r."label")) = lower(btrim(d."lostReason"))
WHERE btrim(d."lostReason") <> ''
ON CONFLICT ("dealId") DO NOTHING;

-- 4) Última atividade do negócio -------------------------------------------------
CREATE TABLE IF NOT EXISTS "eva_studio_deal_activity" (
    "dealId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_deal_activity_pkey" PRIMARY KEY ("dealId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_activity_orgId_lastActivityAt_idx" ON "eva_studio_deal_activity"("orgId", "lastActivityAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_activity_dealId_fkey') THEN
    ALTER TABLE "eva_studio_deal_activity" ADD CONSTRAINT "eva_studio_deal_activity_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: a maior data de atividade conhecida de cada negócio — edição
-- (updatedAt), nota, tarefa concluída e última mensagem nas conversas dos
-- contatos do negócio (fora o playground). Reaplicar só puxa para frente.
INSERT INTO "eva_studio_deal_activity" ("dealId", "orgId", "lastActivityAt")
SELECT d."id", d."orgId", GREATEST(
    d."updatedAt",
    (SELECT max(n."createdAt") FROM "eva_studio_notes" n WHERE n."dealId" = d."id"),
    (SELECT max(t."doneAt") FROM "eva_studio_tasks" t WHERE t."dealId" = d."id"),
    (SELECT max(c."lastMessageAt")
       FROM "eva_studio_deal_contacts" dc
       JOIN "eva_studio_conversations" c ON c."contactRecordId" = dc."contactId" AND c."channel" <> 'playground'
      WHERE dc."dealId" = d."id")
)
FROM "eva_studio_deals" d
ON CONFLICT ("dealId") DO UPDATE
  SET "lastActivityAt" = GREATEST("eva_studio_deal_activity"."lastActivityAt", EXCLUDED."lastActivityAt");

-- 5) Flag no histórico de etapa -----------------------------------------------
-- ADD COLUMN com default constante não reescreve a tabela (Postgres 11+).
ALTER TABLE "eva_studio_deal_stage_events" ADD COLUMN IF NOT EXISTS "ignorouObrigatorios" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
