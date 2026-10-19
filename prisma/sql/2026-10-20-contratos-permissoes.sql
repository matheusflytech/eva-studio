-- Contratos, acesso a N contratos, papéis personalizados, grupos, equipes e
-- chaves de API com responsável/expiração. Só aditivo: cinco tabelas novas e
-- duas colunas anuláveis em eva_studio_api_keys. Nenhum DROP/RENAME/ALTER
-- TYPE. Idempotente (pode rodar de novo).
--
-- NÃO incluir nada do índice vetorial dos chunks que o diff do Prisma sugere
-- derrubar: ele é recriado só pelo prisma/post-migrate.mjs.
--
-- Ver docs/superpowers/plans/2026-10-20-contratos-permissoes.md.
BEGIN;

-- Vínculo pessoa × contrato.
CREATE TABLE IF NOT EXISTS "eva_studio_memberships" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "roleId" TEXT,
    "groupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eva_studio_memberships_orgId_userId_key" ON "eva_studio_memberships"("orgId", "userId");
CREATE INDEX IF NOT EXISTS "eva_studio_memberships_userId_idx" ON "eva_studio_memberships"("userId");

-- Papéis personalizados.
CREATE TABLE IF NOT EXISTS "eva_studio_roles" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "groupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dataScope" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_roles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_roles_orgId_idx" ON "eva_studio_roles"("orgId");

-- Grupos de permissões.
CREATE TABLE IF NOT EXISTS "eva_studio_permission_groups" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_permission_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_permission_groups_orgId_idx" ON "eva_studio_permission_groups"("orgId");

-- Equipes.
CREATE TABLE IF NOT EXISTS "eva_studio_teams" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_teams_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_teams_orgId_idx" ON "eva_studio_teams"("orgId");

CREATE TABLE IF NOT EXISTS "eva_studio_team_members" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_team_members_pkey" PRIMARY KEY ("teamId", "userId")
);
CREATE INDEX IF NOT EXISTS "eva_studio_team_members_userId_idx" ON "eva_studio_team_members"("userId");

-- Chave de API: responsável e expiração (anuláveis: chaves antigas seguem iguais).
ALTER TABLE "eva_studio_api_keys" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "eva_studio_api_keys" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_memberships_orgId_fkey') THEN
    ALTER TABLE "eva_studio_memberships" ADD CONSTRAINT "eva_studio_memberships_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_memberships_userId_fkey') THEN
    ALTER TABLE "eva_studio_memberships" ADD CONSTRAINT "eva_studio_memberships_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "eva_studio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_memberships_roleId_fkey') THEN
    ALTER TABLE "eva_studio_memberships" ADD CONSTRAINT "eva_studio_memberships_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "eva_studio_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_roles_orgId_fkey') THEN
    ALTER TABLE "eva_studio_roles" ADD CONSTRAINT "eva_studio_roles_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_permission_groups_orgId_fkey') THEN
    ALTER TABLE "eva_studio_permission_groups" ADD CONSTRAINT "eva_studio_permission_groups_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_teams_orgId_fkey') THEN
    ALTER TABLE "eva_studio_teams" ADD CONSTRAINT "eva_studio_teams_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "eva_studio_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_teams_leaderId_fkey') THEN
    ALTER TABLE "eva_studio_teams" ADD CONSTRAINT "eva_studio_teams_leaderId_fkey"
      FOREIGN KEY ("leaderId") REFERENCES "eva_studio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_team_members_teamId_fkey') THEN
    ALTER TABLE "eva_studio_team_members" ADD CONSTRAINT "eva_studio_team_members_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "eva_studio_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_team_members_userId_fkey') THEN
    ALTER TABLE "eva_studio_team_members" ADD CONSTRAINT "eva_studio_team_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "eva_studio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_studio_api_keys_createdById_fkey') THEN
    ALTER TABLE "eva_studio_api_keys" ADD CONSTRAINT "eva_studio_api_keys_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "eva_studio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: um vínculo ativo por perfil existente, no contrato padrão dele e
-- com o papel que ele já tem (papel inválido/antigo vira owner, igual o
-- getSessionContext sempre tratou). Rodar de novo não duplica nem sobrescreve
-- vínculo já mexido pela tela (ON CONFLICT DO NOTHING).
INSERT INTO "eva_studio_memberships" ("id", "orgId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p."orgId",
  p."id",
  CASE WHEN p."role" IN ('owner', 'admin', 'agent', 'viewer') THEN p."role" ELSE 'owner' END,
  'ativo',
  p."createdAt",
  CURRENT_TIMESTAMP
FROM "eva_studio_profiles" p
ON CONFLICT ("orgId", "userId") DO NOTHING;

COMMIT;
