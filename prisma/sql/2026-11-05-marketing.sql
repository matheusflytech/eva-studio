-- Marketing M1: origem de cada contato, links rastreados, custo à mão.
-- Só aditivo: cinco tabelas novas, nada existente muda. Rodar numa transação.
-- Spec: docs/superpowers/specs/2026-10-29-marketing-origem-design.md
--
-- eva_studio_touchpoints: um por vez que se sabe de onde o contato veio
--   (site, link de WhatsApp, anúncio, Hotmart, manual). Apagar o contato apaga os toques.
-- eva_studio_tracked_links: link /w/CODE que abre o WhatsApp com "ref: CODE".
-- eva_studio_link_clicks: cada clique no link (IP só como hash) e cada visita
--   do site que saiu para o WhatsApp (code próprio, linkId nulo, UTMs em raw).
-- eva_studio_marketing_spend: investimento lançado à mão por fonte/campanha/período.
-- eva_studio_deal_origins: origem congelada do negócio (último toque pago antes
--   da criação + primeiro toque). Tabela própria, e não coluna em deals, para
--   o schema novo não quebrar leituras de negócio antes deste SQL.
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono das tabelas) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_touchpoints" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "utmId" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "fbclid" TEXT,
    "fbc" TEXT,
    "fbp" TEXT,
    "ctwaClid" TEXT,
    "adId" TEXT,
    "linkId" TEXT,
    "landingUrl" TEXT,
    "referrer" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_touchpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_touchpoints_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_touchpoints_contactId_fkey" FOREIGN KEY ("contactId")
        REFERENCES "eva_studio_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "eva_studio_touchpoints_orgId_contactId_at_idx" ON "eva_studio_touchpoints"("orgId", "contactId", "at");
CREATE INDEX IF NOT EXISTS "eva_studio_touchpoints_orgId_utmSource_utmCampaign_idx" ON "eva_studio_touchpoints"("orgId", "utmSource", "utmCampaign");
CREATE INDEX IF NOT EXISTS "eva_studio_touchpoints_orgId_at_idx" ON "eva_studio_touchpoints"("orgId", "at");

CREATE TABLE IF NOT EXISTS "eva_studio_tracked_links" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentId" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_tracked_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_tracked_links_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_tracked_links_code_key" ON "eva_studio_tracked_links"("code");
CREATE INDEX IF NOT EXISTS "eva_studio_tracked_links_orgId_idx" ON "eva_studio_tracked_links"("orgId");

CREATE TABLE IF NOT EXISTS "eva_studio_link_clicks" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "linkId" TEXT,
    "code" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gclid" TEXT,
    "fbclid" TEXT,
    "referrer" TEXT,
    "ipHash" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "matchedContactId" TEXT,
    CONSTRAINT "eva_studio_link_clicks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_link_clicks_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_link_clicks_linkId_fkey" FOREIGN KEY ("linkId")
        REFERENCES "eva_studio_tracked_links"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_link_clicks_matchedContactId_fkey" FOREIGN KEY ("matchedContactId")
        REFERENCES "eva_studio_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_link_clicks_code_key" ON "eva_studio_link_clicks"("code");
CREATE INDEX IF NOT EXISTS "eva_studio_link_clicks_linkId_at_idx" ON "eva_studio_link_clicks"("linkId", "at");

CREATE TABLE IF NOT EXISTS "eva_studio_marketing_spend" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT '',
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_marketing_spend_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_marketing_spend_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "eva_studio_marketing_spend_orgId_source_campaign_idx" ON "eva_studio_marketing_spend"("orgId", "source", "campaign");

CREATE TABLE IF NOT EXISTS "eva_studio_deal_origins" (
    "dealId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "touchpointId" TEXT,
    "firstTouchpointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_deal_origins_pkey" PRIMARY KEY ("dealId"),
    CONSTRAINT "eva_studio_deal_origins_dealId_fkey" FOREIGN KEY ("dealId")
        REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_deal_origins_touchpointId_fkey" FOREIGN KEY ("touchpointId")
        REFERENCES "eva_studio_touchpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_deal_origins_firstTouchpointId_fkey" FOREIGN KEY ("firstTouchpointId")
        REFERENCES "eva_studio_touchpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_origins_orgId_idx" ON "eva_studio_deal_origins"("orgId");

ALTER TABLE "eva_studio_touchpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_tracked_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_link_clicks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_marketing_spend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_deal_origins" ENABLE ROW LEVEL SECURITY;

COMMIT;
