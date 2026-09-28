import "server-only";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// RBAC — papéis dentro da organização.
//
// O app já isolava por org (requireOrgId), mas todo mundo de dentro podia
// tudo: um atendente contratado pra responder conversa podia apagar agente,
// trocar webhook e disparar campanha. Aqui cada rota diz qual permissão exige.
//
// Prisma não passa por RLS do Supabase, então a checagem é aqui no servidor,
// nunca no cliente — esconder o botão no front é conveniência, não segurança.
// ---------------------------------------------------------------------------

export type Role = "owner" | "admin" | "agent" | "viewer";

export type Permission =
  | "org:manage" // membros, papéis, dados da organização
  | "agents:manage" // criar/editar/apagar agente, fluxo, conexões, credenciais
  | "broadcasts:send" // disparos e sequências
  | "contacts:manage" // criar/editar/importar/etiquetar contatos
  | "conversations:reply" // responder no inbox humano
  | "read"; // ver as telas

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ["org:manage", "agents:manage", "broadcasts:send", "contacts:manage", "conversations:reply", "read"],
  admin: ["agents:manage", "broadcasts:send", "contacts:manage", "conversations:reply", "read"],
  agent: ["contacts:manage", "conversations:reply", "read"],
  viewer: ["read"],
};

export function isRole(value: unknown): value is Role {
  return value === "owner" || value === "admin" || value === "agent" || value === "viewer";
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface SessionContext {
  userId: string;
  orgId: string;
  role: Role;
}

/** Sessão + papel, em uma consulta só. null = não autenticado. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { orgId: true, role: true },
  });
  if (!profile) return null;

  return {
    userId: user.id,
    orgId: profile.orgId,
    // Perfil criado antes do RBAC não tem papel válido gravado — trata como
    // owner, que é o que ele de fato era até agora (migração sem quebrar
    // ninguém que já usava o app).
    role: isRole(profile.role) ? profile.role : "owner",
  };
}

export type AuthFailure = { error: string; status: 401 | 403 };

/**
 * Uso nas rotas:
 *
 *   const ctx = await requirePermission("agents:manage");
 *   if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
 *   // ctx.orgId / ctx.role disponíveis daqui pra frente
 */
export async function requirePermission(permission: Permission): Promise<SessionContext | AuthFailure> {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Não autenticado.", status: 401 };
  if (!can(ctx.role, permission)) {
    return { error: "Seu perfil não tem permissão para essa ação.", status: 403 };
  }
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Dono",
  admin: "Administrador",
  agent: "Atendente",
  viewer: "Somente leitura",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Acesso total, incluindo membros e papéis. Não pode ser removido.",
  admin: "Mexe em agentes, fluxos, disparos e contatos. Não gerencia membros.",
  agent: "Responde conversas e cuida de contatos. Não altera agentes nem dispara campanha.",
  viewer: "Só visualiza. Nenhuma alteração.",
};
