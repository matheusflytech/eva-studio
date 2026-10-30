-- Marketing M2: gasto da Meta Ads lido sozinho. Só aditivo: três tabelas
-- novas, nada existente muda. Rodar numa transação.
-- Spec: docs/superpowers/specs/2026-10-29-marketing-m2-meta-ads-design.md
--
-- eva_studio_marketing_connections: autorização do contrato num provedor
--   (hoje só Meta). Token cifrado em "secrets" (crypto.ts), nunca sai do servidor.
-- eva_studio_marketing_accounts: conta de anúncios vista na conexão; só
--   sincroniza quando a pessoa liga (enabled).
-- eva_studio_ad_daily_metrics: um dia de um anúncio (gasto na moeda da conta).
--   Desconectar não apaga: o histórico é do cliente.
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono das tabelas) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_marketing_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "externalUserId" TEXT NOT NULL,
    "externalLabel" TEXT NOT NULL DEFAULT '',
    "tokenType" TEXT NOT NULL DEFAULT 'user',
    "secrets" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_marketing_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_marketing_connections_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_marketing_connections_orgId_provider_externalUserId_key" ON "eva_studio_marketing_connections"("orgId", "provider", "externalUserId");
CREATE INDEX IF NOT EXISTS "eva_studio_marketing_connections_externalUserId_idx" ON "eva_studio_marketing_connections"("externalUserId");

CREATE TABLE IF NOT EXISTS "eva_studio_marketing_accounts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "syncedThrough" DATE,
    "nextSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncLockedUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_marketing_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_marketing_accounts_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_marketing_accounts_connectionId_fkey" FOREIGN KEY ("connectionId")
        REFERENCES "eva_studio_marketing_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_marketing_accounts_orgId_kind_externalId_key" ON "eva_studio_marketing_accounts"("orgId", "kind", "externalId");
CREATE INDEX IF NOT EXISTS "eva_studio_marketing_accounts_nextSyncAt_idx" ON "eva_studio_marketing_accounts"("nextSyncAt");

CREATE TABLE IF NOT EXISTS "eva_studio_ad_daily_metrics" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT '',
    "adsetId" TEXT NOT NULL DEFAULT '',
    "adsetName" TEXT NOT NULL DEFAULT '',
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL DEFAULT '',
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_ad_daily_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_ad_daily_metrics_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_ad_daily_metrics_accountId_fkey" FOREIGN KEY ("accountId")
        REFERENCES "eva_studio_marketing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_ad_daily_metrics_accountId_date_adId_key" ON "eva_studio_ad_daily_metrics"("accountId", "date", "adId");
CREATE INDEX IF NOT EXISTS "eva_studio_ad_daily_metrics_orgId_date_idx" ON "eva_studio_ad_daily_metrics"("orgId", "date");
CREATE INDEX IF NOT EXISTS "eva_studio_ad_daily_metrics_orgId_adId_idx" ON "eva_studio_ad_daily_metrics"("orgId", "adId");

ALTER TABLE "eva_studio_marketing_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_marketing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_ad_daily_metrics" ENABLE ROW LEVEL SECURITY;

COMMIT;
