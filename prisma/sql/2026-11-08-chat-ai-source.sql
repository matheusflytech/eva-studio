-- IA do chat da Eva: de quem é a chave que responde.
-- Só aditivo: uma coluna com padrão; nada existente muda. Rodar numa transação.
--
-- eva_studio_organizations.chatAiSource
--   eva       = chave da plataforma (GROQ_API_KEY na Vercel). Padrão.
--   contract  = chave que o contrato cadastrou em Integrações.
BEGIN;
ALTER TABLE eva_studio_organizations
  ADD COLUMN IF NOT EXISTS "chatAiSource" text NOT NULL DEFAULT 'eva';
ALTER TABLE eva_studio_organizations
  ADD CONSTRAINT eva_studio_organizations_chat_ai_source_check CHECK ("chatAiSource" IN ('eva', 'contract'));
COMMIT;
