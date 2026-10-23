import "server-only";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { CABECALHO_CONTRATO, COOKIE_CONTRATO } from "@/lib/contrato/rotas";
import { resolverContratoAtivo } from "@/lib/server/contratos";
import { marcarPessoaDaRequisicao } from "@/lib/server/eventos/ator-da-requisicao";
import {
  PAPEIS_DE_SISTEMA,
  permite,
  permissoesDoPapelDeSistema,
  type EscoposDoPapel,
  type PapelDeSistema,
  type PermissaoGranular,
  type PermissaoLegada,
} from "@/lib/permissoes/catalogo";

// ---------------------------------------------------------------------------
// RBAC — papéis dentro do contrato (Organization).
//
// Cada rota diz qual permissão exige. Vale a antiga (org:manage, read, ...) ou
// a granular do catálogo (negocios:editar, ...): as antigas viraram pacotes de
// granulares (src/lib/permissoes/catalogo.ts), então todas as rotas que já
// existiam respondem igual para os papéis de sistema.
//
// O contrato da requisição vem do cabeçalho x-eva-contrato (a URL da aba) e é
// conferido contra o vínculo da pessoa em src/lib/server/contratos.ts. Prisma
// não passa por RLS do Supabase: a checagem é aqui, nunca no cliente.
// ---------------------------------------------------------------------------

export type Role = PapelDeSistema;
export type Permission = PermissaoLegada | PermissaoGranular;

export function isRole(value: unknown): value is Role {
  return value === "owner" || value === "admin" || value === "agent" || value === "viewer";
}

/** Papel de sistema tem a permissão? (Para papel personalizado, use o ctx.) */
export function can(role: Role, permission: Permission): boolean {
  return permite(permissoesDoPapelDeSistema(role), permission);
}

export interface SessionContext {
  userId: string;
  orgId: string;
  /** Papel de sistema (base). Com papel personalizado, ver papelId/permissoes. */
  role: Role;
  papelId?: string | null;
  /** Permissões granulares finais (papel + grupos). */
  permissoes?: PermissaoGranular[];
  /** "Ver só os meus / da equipe / todos" por módulo. */
  escopo?: EscoposDoPapel;
  superadmin?: boolean;
  email?: string;
}

export interface OpcoesDaSessao {
  /**
   * Contrato pedido explicitamente pela rota (ex.: ?contrato= de um download,
   * o orgId gravado no state do OAuth). Vale como o cabeçalho: conferido, e
   * sem acesso = sem sessão.
   */
  contrato?: string | null;
}

export type FalhaDoContrato = "sem_acesso" | "sem_contrato";

async function lerPedido(opcoes?: OpcoesDaSessao): Promise<{ pedido: string | null; cookie: string | null }> {
  let pedido = opcoes?.contrato?.trim() || null;
  let cookie: string | null = null;
  try {
    const h = await headers();
    pedido = pedido ?? (h.get(CABECALHO_CONTRATO)?.trim() || null);
  } catch {
    /* fora de requisição (worker/teste): sem cabeçalho */
  }
  try {
    cookie = (await cookies()).get(COOKIE_CONTRATO)?.value ?? null;
  } catch {
    /* idem */
  }
  return { pedido, cookie };
}

/**
 * Sessão + contrato ativo + permissões. null = não autenticado ou sem acesso
 * ao contrato pedido (o motivo vem em `falha`, para o /api/me).
 */
export async function getSessionContextDetalhado(
  opcoes?: OpcoesDaSessao
): Promise<{ ctx: SessionContext | null; falha?: FalhaDoContrato; userId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ctx: null };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { orgId: true, role: true },
  });
  if (!profile) return { ctx: null };

  const { pedido, cookie } = await lerPedido(opcoes);
  const r = await resolverContratoAtivo(
    { id: user.id, email: user.email, profileOrgId: profile.orgId, profileRole: profile.role },
    pedido,
    cookie
  );
  if (!r.ok) return { ctx: null, falha: r.motivo, userId: user.id };

  const a = r.acesso;
  // O que esta requisição mudar sai no histórico com o nome da pessoa.
  await marcarPessoaDaRequisicao(user.id);
  return {
    userId: user.id,
    ctx: {
      userId: user.id,
      orgId: a.orgId,
      role: a.role,
      papelId: a.papelId,
      permissoes: a.permissoes,
      escopo: a.escopo,
      superadmin: a.superadmin,
      email: user.email ?? undefined,
    },
  };
}

/** Sessão + papel do contrato ativo. null = não autenticado (ou sem acesso). */
export async function getSessionContext(opcoes?: OpcoesDaSessao): Promise<SessionContext | null> {
  return (await getSessionContextDetalhado(opcoes)).ctx;
}

/** O contexto tem a permissão? Antiga ou granular (ver catálogo). */
export function ctxPode(ctx: Pick<SessionContext, "role" | "permissoes">, permission: Permission): boolean {
  const perms = ctx.permissoes ?? permissoesDoPapelDeSistema(ctx.role);
  return permite(perms, permission);
}

export type AuthFailure = { error: string; status: 401 | 403 };

/**
 * Uso nas rotas:
 *
 *   const ctx = await requirePermission("negocios:editar");
 *   if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
 *   // ctx.orgId / ctx.role disponíveis daqui pra frente
 */
export async function requirePermission(
  permission: Permission,
  opcoes?: OpcoesDaSessao
): Promise<SessionContext | AuthFailure> {
  const { ctx, falha } = await getSessionContextDetalhado(opcoes);
  if (!ctx) {
    // Logado, mas pediu um contrato onde não tem vínculo: 403 sem dizer se o
    // contrato existe (não dá para sondar ids de outros clientes).
    if (falha === "sem_acesso") return { error: "Você não tem acesso a este contrato.", status: 403 };
    if (falha === "sem_contrato") return { error: "Você não participa de nenhum contrato.", status: 403 };
    return { error: "Não autenticado.", status: 401 };
  }
  if (!ctxPode(ctx, permission)) {
    return { error: "Seu perfil não tem permissão para essa ação.", status: 403 };
  }
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = Object.fromEntries(
  PAPEIS_DE_SISTEMA.map((p) => [p.id, p.nome])
) as Record<Role, string>;

export const ROLE_DESCRIPTIONS: Record<Role, string> = Object.fromEntries(
  PAPEIS_DE_SISTEMA.map((p) => [p.id, p.descricao])
) as Record<Role, string>;
