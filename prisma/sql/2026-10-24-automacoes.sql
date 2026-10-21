-- Automações do CRM (plano 2026-10-21-automacoes): automações, versões,
-- barramento de eventos, execuções, passos e esperas.
-- Só aditivo: tabelas novas, nada existente muda. Rodar numa transação.
-- Sem estas tabelas o app segue igual: nenhuma automação roda e a tela avisa
-- que falta ativar.
BEGIN;

CREATE TABLE IF NOT EXISTS "eva_studio_automacoes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "objeto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "origem" TEXT NOT NULL DEFAULT 'fluxo',
    "rascunho" JSONB NOT NULL,
    "versaoPublicadaId" TEXT,
    "reinscricao" TEXT NOT NULL DEFAULT 'uma_vez',
    "reinscricaoHoras" INTEGER,
    "objetivo" JSONB,
    "falhasSeguidas" INTEGER NOT NULL DEFAULT 0,
    "pausadaPor" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_automacoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_automacoes_orgId_status_idx" ON "eva_studio_automacoes"("orgId", "status");

CREATE TABLE IF NOT EXISTS "eva_studio_automacao_versoes" (
    "id" TEXT NOT NULL,
    "automacaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "definicao" JSONB NOT NULL,
    "publicadaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_automacao_versoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_automacao_versoes_automacaoId_numero_key" ON "eva_studio_automacao_versoes"("automacaoId", "numero");

CREATE TABLE IF NOT EXISTS "eva_studio_eventos" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "diff" JSONB,
    "ator" JSONB NOT NULL DEFAULT '{}',
    "processadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_eventos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_eventos_orgId_tipo_createdAt_idx" ON "eva_studio_eventos"("orgId", "tipo", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_eventos_processadoEm_createdAt_idx" ON "eva_studio_eventos"("processadoEm", "createdAt");

CREATE TABLE IF NOT EXISTS "eva_studio_automacao_execucoes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "automacaoId" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "eventoId" TEXT,
    "chave" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "noAtual" TEXT,
    "proximaEm" TIMESTAMP(3),
    "travadaAte" TIMESTAMP(3),
    "gatilho" JSONB NOT NULL DEFAULT '{}',
    "variaveis" JSONB NOT NULL DEFAULT '{}',
    "profundidade" INTEGER NOT NULL DEFAULT 0,
    "teste" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,
    "iniciadaEm" TIMESTAMP(3),
    "terminadaEm" TIMESTAMP(3),
    "duracaoMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eva_studio_automacao_execucoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_automacao_execucoes_chave_key" ON "eva_studio_automacao_execucoes"("chave");
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_execucoes_status_proximaEm_idx" ON "eva_studio_automacao_execucoes"("status", "proximaEm");
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_execucoes_automacaoId_createdAt_idx" ON "eva_studio_automacao_execucoes"("automacaoId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_execucoes_orgId_objeto_objetoId_idx" ON "eva_studio_automacao_execucoes"("orgId", "objeto", "objetoId");

CREATE TABLE IF NOT EXISTS "eva_studio_automacao_passos" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "noId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "tentativa" INTEGER NOT NULL DEFAULT 1,
    "entrada" JSONB,
    "saida" JSONB,
    "erro" TEXT,
    "caminho" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEm" TIMESTAMP(3),
    "ms" INTEGER,
    CONSTRAINT "eva_studio_automacao_passos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_passos_execucaoId_iniciadoEm_idx" ON "eva_studio_automacao_passos"("execucaoId", "iniciadoEm");

CREATE TABLE IF NOT EXISTS "eva_studio_automacao_esperas" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "noId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_automacao_esperas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_automacao_esperas_execucaoId_key" ON "eva_studio_automacao_esperas"("execucaoId");
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_esperas_orgId_tipo_objetoId_idx" ON "eva_studio_automacao_esperas"("orgId", "tipo", "objetoId");
CREATE INDEX IF NOT EXISTS "eva_studio_automacao_esperas_expiraEm_idx" ON "eva_studio_automacao_esperas"("expiraEm");

DO $$ BEGIN
  ALTER TABLE "eva_studio_automacao_versoes" ADD CONSTRAINT "eva_studio_automacao_versoes_automacaoId_fkey"
    FOREIGN KEY ("automacaoId") REFERENCES "eva_studio_automacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "eva_studio_automacao_execucoes" ADD CONSTRAINT "eva_studio_automacao_execucoes_automacaoId_fkey"
    FOREIGN KEY ("automacaoId") REFERENCES "eva_studio_automacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "eva_studio_automacao_passos" ADD CONSTRAINT "eva_studio_automacao_passos_execucaoId_fkey"
    FOREIGN KEY ("execucaoId") REFERENCES "eva_studio_automacao_execucoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS ligada, sem política: o anon/authenticated do Supabase (chave pública do
-- navegador) não lê nem grava. O app conecta como postgres (bypassrls).
ALTER TABLE "eva_studio_automacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_automacao_versoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_automacao_execucoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_automacao_passos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eva_studio_automacao_esperas" ENABLE ROW LEVEL SECURITY;

COMMIT;
