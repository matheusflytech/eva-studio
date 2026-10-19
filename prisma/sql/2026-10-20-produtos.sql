-- Produtos no negócio: catálogo por organização, itens do negócio e a
-- escolha "usar valor manual". Só aditivo: três tabelas novas, nenhuma
-- coluna nova em tabela existente. Idempotente (pode rodar de novo).
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_products" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "unit" TEXT NOT NULL DEFAULT 'un',
    "recurrence" TEXT NOT NULL DEFAULT 'unico',
    "category" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_products_orgId_archivedAt_idx" ON "eva_studio_products"("orgId", "archivedAt");

CREATE TABLE IF NOT EXISTS "eva_studio_deal_items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'un',
    "recurrence" TEXT NOT NULL DEFAULT 'unico',
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "discountType" TEXT NOT NULL DEFAULT 'percentual',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_deal_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_items_dealId_position_idx" ON "eva_studio_deal_items"("dealId", "position");
CREATE INDEX IF NOT EXISTS "eva_studio_deal_items_orgId_productId_idx" ON "eva_studio_deal_items"("orgId", "productId");

CREATE TABLE IF NOT EXISTS "eva_studio_deal_amount_settings" (
    "dealId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "manualAmount" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_deal_amount_settings_pkey" PRIMARY KEY ("dealId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_deal_amount_settings_orgId_idx" ON "eva_studio_deal_amount_settings"("orgId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_products_orgId_fkey') THEN
    ALTER TABLE "eva_studio_products" ADD CONSTRAINT "eva_studio_products_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_items_dealId_fkey') THEN
    ALTER TABLE "eva_studio_deal_items" ADD CONSTRAINT "eva_studio_deal_items_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_items_productId_fkey') THEN
    ALTER TABLE "eva_studio_deal_items" ADD CONSTRAINT "eva_studio_deal_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "eva_studio_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_deal_amount_settings_dealId_fkey') THEN
    ALTER TABLE "eva_studio_deal_amount_settings" ADD CONSTRAINT "eva_studio_deal_amount_settings_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "eva_studio_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
