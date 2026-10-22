-- Central de IA (F3c): uso de IA por chamada e limite/preço por chave.
-- Só aditivo: tabelas novas, nada existente muda. Rodar numa transação.
-- Sem estas tabelas o app segue funcionando: não registra uso e não aplica
-- limite (leitura tolerante em src/lib/server/ia/uso.ts).
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_ai_usage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "credentialId" TEXT,
    "agentId" TEXT,
    "recurso" TEXT NOT NULL DEFAULT 'fluxo',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_ai_usage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_ai_usage_orgId_createdAt_idx" ON "eva_studio_ai_usage"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_ai_usage_credentialId_createdAt_idx" ON "eva_studio_ai_usage"("credentialId", "createdAt");

CREATE TABLE IF NOT EXISTS "eva_studio_ai_key_limits" (
    "credentialId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "limiteMensalTokens" INTEGER,
    "precoMilhaoBrl" DECIMAL(10,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_ai_key_limits_pkey" PRIMARY KEY ("credentialId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_ai_key_limits_orgId_idx" ON "eva_studio_ai_key_limits"("orgId");

-- RLS ligada sem política: o app entra como postgres (passa por cima); a
-- chave anon do Supabase não lê nada.
ALTER TABLE "eva_studio_ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_ai_key_limits" ENABLE ROW LEVEL SECURITY;

COMMIT;
