-- Google Agenda. Só aditivo: uma tabela nova, nada existente muda.
-- Rodar numa transação.
--
-- google_calendar_connections: uma por pessoa por contrato (conta Google,
-- refresh token cifrado, agendas escolhidas). Os eventos não são guardados:
-- o servidor busca no Google quando o calendário abre.
--
-- RLS ligado e sem política: o app fala pelo Prisma (dono das tabelas) e a API
-- pública do Supabase não lê nem escreve nada aqui.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_google_calendar_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "secrets" TEXT NOT NULL DEFAULT '',
    "calendars" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_google_calendar_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eva_studio_google_calendar_connections_orgId_fkey" FOREIGN KEY ("orgId")
        REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_google_calendar_connections_orgId_userId_key" ON "eva_studio_google_calendar_connections"("orgId", "userId");

ALTER TABLE "eva_studio_google_calendar_connections" ENABLE ROW LEVEL SECURITY;

COMMIT;
