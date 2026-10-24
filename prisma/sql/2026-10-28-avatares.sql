-- Foto de contatos e da equipe (docs/superpowers/specs/2026-10-23-painel-
-- editavel-e-fotos-design.md, parte B). Só aditivo: coluna nula, sem foto
-- vale a inicial. O arquivo mora no bucket público "eva-avatares", com
-- caminho {orgId}/{uuid}.webp; aqui fica só o caminho.
BEGIN;

ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "avatarPath" TEXT;
ALTER TABLE "eva_studio_profiles" ADD COLUMN IF NOT EXISTS "avatarPath" TEXT;

COMMIT;
