-- Visões salvas das listas do CRM (item 5 de
-- docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md, fase L4 de
-- docs/superpowers/plans/2026-10-20-listas-filtros-visoes.md).
--
-- Só aditivo: DUAS tabelas novas, nenhuma coluna em tabela existente.
-- Idempotente (pode rodar de novo). Sem elas o app funciona: as abas mostram
-- só as visões de sistema (Todos, Meus...), colunas e colunas recolhidas
-- ficam no navegador e a tela avisa, discreta, que salvar visão ainda não
-- está ativado.
--
-- O isolamento por contrato é feito no servidor (toda leitura/escrita filtra
-- "orgId" + visibilidade). RLS entra junto com o item 22.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_saved_views" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "pipelineId" TEXT,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'pessoal',
    "teamId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "eva_studio_saved_view_defaults" (
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_saved_view_defaults_pkey" PRIMARY KEY ("orgId", "userId", "entity")
);

DO $$ BEGIN
  -- Contrato apagado leva as visões; dono que sai do sistema leva as dele.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_orgId_fkey') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_ownerId_fkey') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "eva_studio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- Funil apagado leva as visões presas a ele.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_pipelineId_fkey') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES "eva_studio_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- Equipe apagada: a visão fica só para o dono (o app trata equipe sem teamId assim).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_teamId_fkey') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "eva_studio_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_entity_check') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_entity_check"
      CHECK ("entity" IN ('contatos', 'negocios'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_visibility_check') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_visibility_check"
      CHECK ("visibility" IN ('pessoal', 'equipe', 'contrato'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_name_check') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_name_check"
      CHECK (char_length("name") BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_views_config_check') THEN
    ALTER TABLE "eva_studio_saved_views" ADD CONSTRAINT "eva_studio_saved_views_config_check"
      CHECK (jsonb_typeof("config") = 'object' AND pg_column_size("config") <= 65536);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_view_defaults_orgId_fkey') THEN
    ALTER TABLE "eva_studio_saved_view_defaults" ADD CONSTRAINT "eva_studio_saved_view_defaults_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_view_defaults_userId_fkey') THEN
    ALTER TABLE "eva_studio_saved_view_defaults" ADD CONSTRAINT "eva_studio_saved_view_defaults_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "eva_studio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_saved_view_defaults_entity_check') THEN
    ALTER TABLE "eva_studio_saved_view_defaults" ADD CONSTRAINT "eva_studio_saved_view_defaults_entity_check"
      CHECK ("entity" IN ('contatos', 'negocios'));
  END IF;
END $$;

-- As abas leem por contrato + lista, na ordem da posição; o filtro de
-- visibilidade (dono / equipe / contrato) roda sobre esse conjunto pequeno.
CREATE INDEX IF NOT EXISTS "eva_studio_saved_views_orgId_entity_position_idx"
  ON "eva_studio_saved_views"("orgId", "entity", "position");
-- FK sem índice deixa o DELETE do dono/equipe/funil varrer a tabela.
CREATE INDEX IF NOT EXISTS "eva_studio_saved_views_ownerId_idx" ON "eva_studio_saved_views"("ownerId");
CREATE INDEX IF NOT EXISTS "eva_studio_saved_views_teamId_idx" ON "eva_studio_saved_views"("teamId") WHERE "teamId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "eva_studio_saved_views_pipelineId_idx" ON "eva_studio_saved_views"("pipelineId") WHERE "pipelineId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "eva_studio_saved_view_defaults_userId_idx" ON "eva_studio_saved_view_defaults"("userId");

COMMIT;
