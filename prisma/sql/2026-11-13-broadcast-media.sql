-- Imagem/arquivo no disparo (WhatsApp via QR).
-- Só aditivo: quatro colunas opcionais; nada existente muda. Rodar ANTES do deploy
-- do app (o Prisma passa a ler essas colunas em todo disparo).
BEGIN;
ALTER TABLE eva_studio_broadcasts ADD COLUMN IF NOT EXISTS "mediaPath" text;
ALTER TABLE eva_studio_broadcasts ADD COLUMN IF NOT EXISTS "mediaType" text;
ALTER TABLE eva_studio_broadcasts ADD COLUMN IF NOT EXISTS "mediaMime" text;
ALTER TABLE eva_studio_broadcasts ADD COLUMN IF NOT EXISTS "mediaName" text;
COMMIT;
