-- Tarefas de verdade (item 3 de docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md):
-- dia todo, prioridade, duração, origem (manual / automação / IA) e o fluxo
-- de conclusão (resultado, nota, decisão do próximo passo, tarefa seguinte),
-- além de quantas vezes a tarefa foi adiada.
--
-- Só aditivo: UMA tabela nova, 1:1 com eva_studio_tasks. Nenhuma coluna nova
-- em tabela existente (coluna nova quebraria as leituras do Prisma até este
-- SQL rodar). Idempotente (pode rodar de novo). Sem ela o app funciona: tipos
-- novos, quick add, Meu dia, filas, adiar e a conclusão com próximo passo
-- obrigatório continuam; só não ficam guardados prioridade, duração, origem,
-- resultado e a decisão (o resultado e a nota da conclusão viram uma nota
-- do negócio/contato de qualquer jeito, então a timeline não perde nada).
-- Dia todo é deduzido da hora 23:59 de SP.
--
-- Os tipos novos (whatsapp, visita, afazer) cabem na coluna "type" (TEXT,
-- sem CHECK); "outro" antigo continua valendo e é exibido como "A fazer".
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_task_details" (
    "taskId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "durationMin" INTEGER,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "outcome" TEXT,
    "outcomeNote" TEXT,
    "nextStepDecision" TEXT,
    "nextTaskId" TEXT,
    "completedById" TEXT,
    "snoozedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_task_details_pkey" PRIMARY KEY ("taskId")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_taskId_fkey') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "eva_studio_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_priority_check') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_priority_check"
      CHECK ("priority" IN ('normal', 'alta'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_origin_check') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_origin_check"
      CHECK ("origin" IN ('manual', 'automacao', 'ia'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_outcome_check') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_outcome_check"
      CHECK ("outcome" IS NULL OR "outcome" IN ('falou', 'nao_atendeu', 'remarcou', 'outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_next_step_check') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_next_step_check"
      CHECK ("nextStepDecision" IS NULL OR "nextStepDecision" IN ('agendou', 'sem_proximo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_task_details_duration_check') THEN
    ALTER TABLE "eva_studio_task_details" ADD CONSTRAINT "eva_studio_task_details_duration_check"
      CHECK ("durationMin" IS NULL OR ("durationMin" BETWEEN 1 AND 1440));
  END IF;
END $$;

-- Leitura é sempre pela PK (taskId IN (...)); o índice por contrato serve à
-- RLS do item 22 e a limpezas por contrato.
CREATE INDEX IF NOT EXISTS "eva_studio_task_details_orgId_idx" ON "eva_studio_task_details"("orgId");

-- A tela de tarefas filtra por responsável + aberta + prazo (Minhas/Equipe e o
-- Meu dia). O índice antigo (assignedToId, doneAt) não cobre a ordem por prazo.
-- A tabela de tarefas é pequena (bloqueio de escrita de segundos); se crescer,
-- rode este índice fora da transação com CREATE INDEX CONCURRENTLY.
CREATE INDEX IF NOT EXISTS "eva_studio_tasks_orgId_assignedToId_doneAt_dueAt_idx"
  ON "eva_studio_tasks"("orgId", "assignedToId", "doneAt", "dueAt");

COMMIT;
