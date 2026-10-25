-- Número por contrato para funis e etapas (o id que a API e a tela mostram).
--
-- O primeiro funil do contrato é o 1, o segundo o 2...; as etapas são
-- numeradas no contrato inteiro (etapa 1, 2, 3... somando todos os funis),
-- então stage_id sozinho já identifica a etapa. O UUID continua como chave
-- interna (todas as ligações de negócios, sequências, regras e fluxos salvos
-- apontam para ele) e deixa de aparecer para fora.
--
-- Quem cria funil ou etapa não precisa mandar o número: um gatilho preenche
-- com o próximo do contrato. O lock por contrato impede que dois cadastros ao
-- mesmo tempo peguem o mesmo número. Número usado não é reaproveitado depois
-- de excluir (como id de verdade).
--
-- Tabelas pequenas (5 funis e 29 etapas em 24/10/2026): backfill e índices
-- na hora, sem travar ninguém. Só aditivo.
BEGIN;

-- Funis -------------------------------------------------------------------
ALTER TABLE "eva_studio_pipelines" ADD COLUMN IF NOT EXISTS "numero" INTEGER;

UPDATE "eva_studio_pipelines" p
   SET "numero" = n.numero
  FROM (
    SELECT id, row_number() OVER (PARTITION BY "orgId" ORDER BY "position", "createdAt", id) AS numero
      FROM "eva_studio_pipelines"
  ) n
 WHERE n.id = p.id AND p."numero" IS NULL;

ALTER TABLE "eva_studio_pipelines" ALTER COLUMN "numero" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_pipelines_orgId_numero_key" ON "eva_studio_pipelines" ("orgId", "numero");

-- Etapas: ganham o contrato (para numerar e buscar por contrato) ----------
ALTER TABLE "eva_studio_pipeline_stages" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE "eva_studio_pipeline_stages" ADD COLUMN IF NOT EXISTS "numero" INTEGER;

UPDATE "eva_studio_pipeline_stages" s
   SET "orgId" = p."orgId"
  FROM "eva_studio_pipelines" p
 WHERE p.id = s."pipelineId" AND s."orgId" IS NULL;

UPDATE "eva_studio_pipeline_stages" s
   SET "numero" = n.numero
  FROM (
    SELECT s2.id, row_number() OVER (PARTITION BY s2."orgId" ORDER BY p."numero", s2."position", s2.id) AS numero
      FROM "eva_studio_pipeline_stages" s2
      JOIN "eva_studio_pipelines" p ON p.id = s2."pipelineId"
  ) n
 WHERE n.id = s.id AND s."numero" IS NULL;

ALTER TABLE "eva_studio_pipeline_stages" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "eva_studio_pipeline_stages" ALTER COLUMN "numero" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_pipeline_stages_orgId_numero_key" ON "eva_studio_pipeline_stages" ("orgId", "numero");

-- Gatilhos: preenchem contrato e próximo número em todo cadastro -----------
CREATE OR REPLACE FUNCTION "eva_studio_numerar_funil"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."numero" IS NULL OR NEW."numero" <= 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('funil:' || NEW."orgId"));
    SELECT coalesce(max("numero"), 0) + 1 INTO NEW."numero"
      FROM "eva_studio_pipelines" WHERE "orgId" = NEW."orgId";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "eva_studio_numerar_funil" ON "eva_studio_pipelines";
CREATE TRIGGER "eva_studio_numerar_funil" BEFORE INSERT ON "eva_studio_pipelines"
  FOR EACH ROW EXECUTE FUNCTION "eva_studio_numerar_funil"();

CREATE OR REPLACE FUNCTION "eva_studio_numerar_etapa"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orgId" IS NULL THEN
    SELECT "orgId" INTO NEW."orgId" FROM "eva_studio_pipelines" WHERE id = NEW."pipelineId";
  END IF;
  IF NEW."numero" IS NULL OR NEW."numero" <= 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('etapa:' || NEW."orgId"));
    SELECT coalesce(max("numero"), 0) + 1 INTO NEW."numero"
      FROM "eva_studio_pipeline_stages" WHERE "orgId" = NEW."orgId";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "eva_studio_numerar_etapa" ON "eva_studio_pipeline_stages";
CREATE TRIGGER "eva_studio_numerar_etapa" BEFORE INSERT ON "eva_studio_pipeline_stages"
  FOR EACH ROW EXECUTE FUNCTION "eva_studio_numerar_etapa"();

COMMIT;
