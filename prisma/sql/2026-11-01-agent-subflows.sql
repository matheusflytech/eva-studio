-- S4: vários fluxos por bot ("Menu principal", "Vendas", "Suporte"). Só
-- aditivo. Rodar numa transação.
--
-- O fluxo de hoje (eva_studio_agent_flows) continua sendo o principal, sem
-- mudar nada. Os fluxos extras moram na tabela nova; "Ir para fluxo" e a
-- palavra-chave levam a conversa para um deles. A conversa guarda em qual
-- fluxo está ("currentFlowId"); vazio = fluxo principal, então as conversas
-- de hoje seguem iguais.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_agent_subflows" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_agent_subflows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_agent_subflows_agentId_fkey" FOREIGN KEY ("agentId")
        REFERENCES "eva_studio_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_agent_subflows_agentId_name_key" ON "eva_studio_agent_subflows"("agentId", "name");

ALTER TABLE "eva_studio_agent_subflows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "eva_studio_conversations" ADD COLUMN IF NOT EXISTS "currentFlowId" TEXT;

COMMIT;
