-- Listas de contatos e negócios (Fase L1, docs/superpowers/plans/2026-10-20-listas-filtros-visoes.md).
-- Só aditivo: índices novos, nada muda nem some. Os nomes são os que o Prisma
-- gera para os @@index do schema.prisma (sem divergência no próximo diff).
--
-- POR QUE: a lista de contatos ordena por última atividade/criação e filtra
-- por responsável (inclusive pelo escopo "só os meus"); o quadro de negócios
-- pagina cada coluna por (position, id) dentro do funil e da etapa, e a lista
-- filtra por responsável e criação. Sem esses índices, cada página varre o
-- contrato inteiro.
--
-- COMO APLICAR (com OK do Alfredo; NÃO roda sozinho):
--   * Base pequena / janela de manutenção: rodar o arquivo como está.
--     CREATE INDEX comum trava ESCRITA na tabela enquanto constrói.
--   * Produção com tabela grande (ex. PayIP, 300 mil negócios): prefira rodar
--     cada linha trocando "CREATE INDEX IF NOT EXISTS" por
--     "CREATE INDEX CONCURRENTLY IF NOT EXISTS", UMA POR VEZ e FORA de
--     transação (CONCURRENTLY não pode rodar dentro de BEGIN/COMMIT nem em
--     bloco de várias instruções no editor do Supabase). Não trava escrita.
--     Se uma falhar no meio, ela fica INVALID: DROP INDEX e rode de novo.
-- Este arquivo não usa BEGIN/COMMIT de propósito, para servir aos dois modos.

-- Contatos
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_orgId_lastSeenAt_idx"
  ON "eva_studio_contacts"("orgId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_orgId_ownerId_idx"
  ON "eva_studio_contacts"("orgId", "ownerId");
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_orgId_createdAt_idx"
  ON "eva_studio_contacts"("orgId", "createdAt");

-- Negócios
CREATE INDEX IF NOT EXISTS "eva_studio_deals_orgId_pipelineId_stageId_position_id_idx"
  ON "eva_studio_deals"("orgId", "pipelineId", "stageId", "position", "id");
CREATE INDEX IF NOT EXISTS "eva_studio_deals_orgId_ownerId_idx"
  ON "eva_studio_deals"("orgId", "ownerId");
CREATE INDEX IF NOT EXISTS "eva_studio_deals_orgId_createdAt_idx"
  ON "eva_studio_deals"("orgId", "createdAt");
