-- WhatsApp por QR: pareamento por código, reconexão com histórico e grupos.
-- Só aditivo: colunas novas com padrão e uma tabela nova; nada existente muda.
-- Rodar numa transação.
--
-- eva_studio_canais_whatsapp_qr (sessão do worker, uma por canal):
--   pairingPhone         número (só dígitos, com DDI) que a pessoa pediu para parear
--                        por código de 8 dígitos, em vez de ler o QR. Nulo = modo QR.
--   pairingCode          o código gerado pelo WhatsApp para esse número (curta duração).
--   reconnectAttempts    quedas seguidas sem abrir; zera ao conectar. A tela mostra
--                        "tentando de novo (n)" e o worker usa para a espera crescente.
--   lastConnectedAt      última vez que a sessão abriu.
--   lastDisconnectedAt   última vez que caiu depois de conectada (base do alerta).
--
-- eva_studio_whatsapp_groups: grupos do número conectado, trazidos pelo worker.
--   mode  mention = o agente só responde quando marcado (comportamento de antes)
--         all     = responde a todas as mensagens do grupo
--         off     = só registra, nunca responde
--   Sair do grupo (ou desconectar o canal) mantém a linha com present = false:
--   o histórico de conversas do grupo continua apontando para ela.
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono das tabelas) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

ALTER TABLE "eva_studio_canais_whatsapp_qr"
    ADD COLUMN IF NOT EXISTS "pairingPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "pairingCode" TEXT,
    ADD COLUMN IF NOT EXISTS "reconnectAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lastConnectedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lastDisconnectedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "eva_studio_whatsapp_groups" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "participantsCount" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'mention',
    "present" BOOLEAN NOT NULL DEFAULT TRUE,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_whatsapp_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_whatsapp_groups_mode_check" CHECK ("mode" IN ('mention', 'all', 'off')),
    CONSTRAINT "eva_studio_whatsapp_groups_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eva_studio_whatsapp_groups_channelId_fkey" FOREIGN KEY ("channelId")
        REFERENCES "eva_studio_canais"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_whatsapp_groups_channelId_jid_key" ON "eva_studio_whatsapp_groups"("channelId", "jid");
CREATE INDEX IF NOT EXISTS "eva_studio_whatsapp_groups_orgId_idx" ON "eva_studio_whatsapp_groups"("orgId");

ALTER TABLE "eva_studio_whatsapp_groups" ENABLE ROW LEVEL SECURITY;

COMMIT;
