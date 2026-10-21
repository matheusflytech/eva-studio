-- Central de IA (F3b): conexão única de IA por contrato, com ordem de
-- preferência e reserva automática. Só aditivo: tabela nova, nada existente
-- muda. Rodar numa transação. Sem esta tabela o app segue com a escolha
-- automática de antes (leitura tolerante em src/lib/server/ia/conexao.ts).
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_ai_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "passos" JSONB NOT NULL DEFAULT '[]',
    "timeoutMs" INTEGER NOT NULL DEFAULT 25000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_ai_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_ai_connections_orgId_key" ON "eva_studio_ai_connections"("orgId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_ai_connections_orgId_fkey') THEN
    ALTER TABLE "eva_studio_ai_connections" ADD CONSTRAINT "eva_studio_ai_connections_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
