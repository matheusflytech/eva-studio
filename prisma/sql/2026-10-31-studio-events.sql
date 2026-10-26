-- S3: eventos do Studio (tracking e relatório dentro do Eva). Só aditivo:
-- tabela nova, nada existente muda. Rodar numa transação.
--
-- Uma linha por evento: os automáticos do motor ("entrou no bloco", "clicou
-- no botão X", "saiu por não responder") e os da ação "Registrar evento" do
-- Bloco. A aba Relatórios lê daqui (funil por bloco, eventos por
-- categoria/ação, filtro de período e canal).
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono da tabela) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_studio_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channel" TEXT,
    "contactId" TEXT,
    "nodeId" TEXT,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "value" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_studio_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_studio_events_agentId_fkey" FOREIGN KEY ("agentId")
        REFERENCES "eva_studio_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "eva_studio_studio_events_agentId_createdAt_idx" ON "eva_studio_studio_events"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_studio_events_agentId_nodeId_createdAt_idx" ON "eva_studio_studio_events"("agentId", "nodeId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_studio_events_orgId_createdAt_idx" ON "eva_studio_studio_events"("orgId", "createdAt");

ALTER TABLE "eva_studio_studio_events" ENABLE ROW LEVEL SECURITY;

COMMIT;
