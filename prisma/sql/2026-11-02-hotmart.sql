-- Hotmart nativa (F1). Só aditivo: três tabelas novas, nada existente muda.
-- Rodar numa transação.
--
-- hotmart_connections: uma por contrato (token da URL do webhook, hottok
-- cifrado, mapa produto -> funil -> etapas).
-- hotmart_events: um por evento recebido (idempotência, log do painel,
-- "Reprocessar").
-- sales: uma linha por transação de plataforma de venda (cada mensalidade é
-- uma transação).
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono das tabelas) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_hotmart_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "secrets" TEXT NOT NULL DEFAULT '',
    "products" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_hotmart_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_hotmart_connections_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_hotmart_connections_orgId_key" ON "eva_studio_hotmart_connections"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_hotmart_connections_token_key" ON "eva_studio_hotmart_connections"("token");

CREATE TABLE IF NOT EXISTS "eva_studio_hotmart_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "hotmartEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "productId" TEXT,
    "transaction" TEXT,
    "email" TEXT,
    "payload" JSONB NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "detail" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "eva_studio_hotmart_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_hotmart_events_connectionId_fkey" FOREIGN KEY ("connectionId")
        REFERENCES "eva_studio_hotmart_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_hotmart_events_connectionId_hotmartEventId_key" ON "eva_studio_hotmart_events"("connectionId", "hotmartEventId");
CREATE INDEX IF NOT EXISTS "eva_studio_hotmart_events_orgId_createdAt_idx" ON "eva_studio_hotmart_events"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "eva_studio_sales" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "transaction" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "offerCode" TEXT,
    "plan" TEXT,
    "subscriberCode" TEXT,
    "recurrence" INTEGER,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountBrlCents" INTEGER NOT NULL DEFAULT 0,
    "paymentType" TEXT,
    "installments" INTEGER,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "src" TEXT,
    "sck" TEXT,
    "channel" TEXT,
    "orderedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "contactId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_sales_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_sales_orgId_platform_transaction_key" ON "eva_studio_sales"("orgId", "platform", "transaction");
CREATE INDEX IF NOT EXISTS "eva_studio_sales_orgId_approvedAt_idx" ON "eva_studio_sales"("orgId", "approvedAt");

ALTER TABLE "eva_studio_hotmart_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_hotmart_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_sales" ENABLE ROW LEVEL SECURITY;

COMMIT;
