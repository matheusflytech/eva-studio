-- Hotmart: cada contrato escolhe em que campo personalizado grava cada dado
-- (mapa dado -> chave do campo; null = não grava). Vazio = campos padrão.
--
-- Roda ANTES do deploy: o Prisma lê a coluna nova em toda conexão.
BEGIN;

ALTER TABLE "eva_studio_hotmart_connections" ADD COLUMN IF NOT EXISTS "fields" JSONB NOT NULL DEFAULT '{}';

COMMIT;
