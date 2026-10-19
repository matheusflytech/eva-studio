-- WhatsApp: envios agendados (mensagem avulsa), trava da fila do worker e
-- acompanhamento de template criado na Meta. Só aditivo: colunas novas com
-- default/nullable e índices; nada existente muda de tipo nem some.
-- Aplicar ANTES de subir o app e o worker (os dois leem as colunas novas).
BEGIN;

-- Template: status vindo do webhook da Meta + o que foi enviado pra ela.
ALTER TABLE "eva_studio_message_templates" ADD COLUMN IF NOT EXISTS "metaTemplateId" TEXT;
ALTER TABLE "eva_studio_message_templates" ADD COLUMN IF NOT EXISTS "metaStatus" TEXT;
ALTER TABLE "eva_studio_message_templates" ADD COLUMN IF NOT EXISTS "metaStatusReason" TEXT;
ALTER TABLE "eva_studio_message_templates" ADD COLUMN IF NOT EXISTS "metaStatusAt" TIMESTAMP(3);
ALTER TABLE "eva_studio_message_templates" ADD COLUMN IF NOT EXISTS "metaComponents" JSONB;
CREATE INDEX IF NOT EXISTS "eva_studio_message_templates_metaTemplateId_idx"
  ON "eva_studio_message_templates"("metaTemplateId");

-- Disparo: mensagem avulsa agendada reaproveita o Broadcast.
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'campaign';
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "contactRecordId" TEXT;
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "dealId" TEXT;
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
CREATE INDEX IF NOT EXISTS "eva_studio_broadcasts_contactRecordId_idx" ON "eva_studio_broadcasts"("contactRecordId");
CREATE INDEX IF NOT EXISTS "eva_studio_broadcasts_dealId_idx" ON "eva_studio_broadcasts"("dealId");

-- Fila do worker: quando o item foi reivindicado (status 'sending').
ALTER TABLE "eva_studio_outbound_queue" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

COMMIT;
