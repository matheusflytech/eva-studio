-- Modelos de disparo (app de disparos). Só aditivo: tabela nova; nada existente muda.
-- Rodar ANTES do deploy do app.
BEGIN;
CREATE TABLE IF NOT EXISTS eva_studio_broadcast_templates (
  id text PRIMARY KEY,
  "orgId" text NOT NULL,
  name text NOT NULL,
  text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mediaPath" text,
  "mediaType" text,
  "mediaMime" text,
  "mediaName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS eva_studio_broadcast_templates_org_idx ON eva_studio_broadcast_templates ("orgId");
-- Sem política: o app acessa pelo Prisma (dono da tabela); a API pública do Supabase não lê nada.
ALTER TABLE eva_studio_broadcast_templates ENABLE ROW LEVEL SECURITY;
COMMIT;
