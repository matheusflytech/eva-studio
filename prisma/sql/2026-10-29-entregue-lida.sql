-- Entregue e lida nos disparos (placar da tela Disparos). Só aditivo.
--
-- Cada envio de disparo (WhatsApp QR pela fila do worker, WhatsApp oficial
-- direto) já vira uma linha em eva_studio_outbound_queue. Agora ela guarda o
-- id que o WhatsApp deu à mensagem ("externalId"), para o recibo de
-- entregue/lida achar a linha, e quando cada recibo chegou. O disparo soma
-- uma vez por mensagem em "deliveredCount" e "readCount".
--
-- Tabelas pequenas hoje (2 itens na fila, 0 disparos em 24/10/2026): o índice
-- é criado na hora, sem travar ninguém.
BEGIN;

ALTER TABLE "eva_studio_outbound_queue" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "eva_studio_outbound_queue" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "eva_studio_outbound_queue" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "eva_studio_outbound_queue_externalId_idx" ON "eva_studio_outbound_queue" ("externalId");

ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "deliveredCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "eva_studio_broadcasts" ADD COLUMN IF NOT EXISTS "readCount" INTEGER NOT NULL DEFAULT 0;

COMMIT;
