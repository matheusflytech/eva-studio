import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  ESCOPO_TODOS,
  PERMISSOES,
  limparEscopos,
  limparPermissoes,
  montarPermissoes,
  permissoesDoPapelDeSistema,
  type EscoposDoPapel,
  type PapelDeSistema,
  type PermissaoGranular,
} from "@/lib/permissoes/catalogo";
import { ehIdCompletoDeContrato, ehIdCurtoDeContrato } from "@/lib/contrato/rotas";

// ---------------------------------------------------------------------------
// Contrato ativo: qual Organization esta requisição enxerga.
//
// O maior risco do modelo "uma pessoa, N contratos" é vazar dados de um
// contrato para outro, porque toda rota filtra por ctx.orgId. Por isso o
// contrato pedido pelo navegador (cabeçalho x-eva-contrato) é SEMPRE conferido
// aqui contra o vínculo da pessoa — ou superadmin — antes de virar ctx.orgId.
//
// Regra de acesso ao contrato X:
//   1. vínculo (X, pessoa) com status ativo/convidado; ou
//   2. nenhum vínculo com X e Profile.orgId = X (legado, antes do backfill); ou
//   3. superadmin (EVA_SUPERADMINS).
// Vínculo "removido" bloqueia mesmo com Profile.orgId = X.
//
// Antes do SQL de contratos ser aplicado, as tabelas novas não existem: tudo
// cai no comportamento antigo (só Profile.orgId), sem quebrar o login.
// ---------------------------------------------------------------------------

export const STATUS_COM_ACESSO = ["ativo", "convidado"];

export function ehPapelDeSistema(v: unknown): v is PapelDeSistema {
  return v === "owner" || v === "admin" || v === "agent" || v === "viewer";
}

/** Erro de tabela/coluna que ainda não existe (SQL novo não aplicado). */
export function ehTabelaAusente(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2021" || code === "P2022") return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /does not exist|não existe/i.test(msg);
}

/** Tenta o caminho novo; se a tabela nova não existe, faz o antigo. */
export async function comFallbackLegado<T>(novo: () => Promise<T>, legado: () => Promise<T>): Promise<T> {
  try {
    return await novo();
  } catch (e) {
    if (ehTabelaAusente(e)) return legado();
    throw e;
  }
}

// --- Superadmin -------------------------------------------------------------

/**
 * EVA_SUPERADMINS = e-mails e/ou ids de usuário do Supabase, separados por
 * vírgula. É a equipe da Eva: entra em qualquer contrato como dono.
 */
export function ehSuperadmin(user: { id: string; email?: string | null }): boolean {
  const lista = (process.env.EVA_SUPERADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (lista.length === 0) return false;
  return lista.includes(user.id.toLowerCase()) || (!!user.email && lista.includes(user.email.trim().toLowerCase()));
}

// --- Acesso a um contrato ---------------------------------------------------

export interface AcessoAoContrato {
  orgId: string;
  role: PapelDeSistema;
  papelId: string | null;
  permissoes: PermissaoGranular[];
  escopo: EscoposDoPapel;
  membershipId: string | null;
  superadmin: boolean;
}

interface Pessoa {
  id: string;
  email?: string | null;
  profileOrgId: string;
  profileRole: string;
}

type VinculoComPapel = Prisma.MembershipGetPayload<{ include: { customRole: true } }>;

async function permissoesDosGrupos(orgId: string, ids: string[]): Promise<string[][]> {
  if (ids.length === 0) return [];
  const grupos = await prisma.permissionGroup
    .findMany({ where: { orgId, id: { in: ids } }, select: { permissions: true } })
    .catch(() => [] as { permissions: string[] }[]);
  return grupos.map((g) => g.permissions);
}

async function montarAcesso(orgId: string, v: VinculoComPapel): Promise<AcessoAoContrato> {
  const role: PapelDeSistema = ehPapelDeSistema(v.role) ? v.role : "viewer";
  const papel = v.roleId && v.customRole && v.customRole.orgId === orgId ? v.customRole : null;
  const base = papel ? limparPermissoes(papel.permissions) : permissoesDoPapelDeSistema(role);
  const grupos = await permissoesDosGrupos(orgId, [...new Set([...(v.groupIds ?? []), ...(papel?.groupIds ?? [])])]);
  return {
    orgId,
    role,
    papelId: papel?.id ?? null,
    // Dono é dono: papel personalizado não se aplica a quem tem "owner".
    permissoes: role === "owner" ? [...PERMISSOES].sort() : montarPermissoes(base, grupos),
    escopo: papel && role !== "owner" ? limparEscopos(papel.dataScope) : ESCOPO_TODOS,
    membershipId: v.id,
    superadmin: false,
  };
}

function acessoLegado(orgId: string, profileRole: string): AcessoAoContrato {
  // Perfil criado antes do RBAC não tem papel válido gravado — trata como
  // owner, que é o que ele de fato era (mesma regra de sempre).
  const role: PapelDeSistema = ehPapelDeSistema(profileRole) ? profileRole : "owner";
  return {
    orgId,
    role,
    papelId: null,
    permissoes: permissoesDoPapelDeSistema(role),
    escopo: ESCOPO_TODOS,
    membershipId: null,
    superadmin: false,
  };
}

function acessoSuperadmin(orgId: string): AcessoAoContrato {
  return {
    orgId,
    role: "owner",
    papelId: null,
    permissoes: [...PERMISSOES].sort(),
    escopo: ESCOPO_TODOS,
    membershipId: null,
    superadmin: true,
  };
}

/** A pessoa entra no contrato? null = não (sem vazar o motivo). */
export async function acessoAoContrato(pessoa: Pessoa, orgId: string): Promise<AcessoAoContrato | null> {
  if (!ehIdCompletoDeContrato(orgId) && orgId !== pessoa.profileOrgId) return null;

  let vinculo: VinculoComPapel | null | "legado";
  try {
    vinculo = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: pessoa.id } },
      include: { customRole: true },
    });
  } catch (e) {
    if (!ehTabelaAusente(e)) throw e;
    vinculo = "legado";
  }

  if (vinculo && vinculo !== "legado") {
    if (STATUS_COM_ACESSO.includes(vinculo.status)) {
      if (vinculo.status === "convidado") {
        // Primeiro acesso depois do convite: vira ativo (sem esperar).
        prisma.membership
          .update({ where: { id: vinculo.id }, data: { status: "ativo" }, select: { id: true } })
          .catch(() => {});
      }
      return montarAcesso(orgId, vinculo);
    }
    // Removido: nem o legado nem nada abaixo abre a porta — só superadmin.
    return ehSuperadmin(pessoa) ? acessoSuperadmin(orgId) : null;
  }

  if (pessoa.profileOrgId === orgId) return acessoLegado(orgId, pessoa.profileRole);

  if (ehSuperadmin(pessoa)) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    return org ? acessoSuperadmin(orgId) : null;
  }
  return null;
}

export type ResultadoDoContrato =
  | { ok: true; acesso: AcessoAoContrato }
  | { ok: false; motivo: "sem_acesso" | "sem_contrato" };

/**
 * Qual contrato esta requisição usa.
 *
 *   pedido   cabeçalho x-eva-contrato (ou ?contrato= nas rotas que o navegador
 *            abre sozinho). Presente e sem acesso = sem_acesso: NUNCA cai em
 *            outro contrato, senão uma aba que pediu A mostraria dados de B.
 *   cookie   eva_contrato, o último usado. Sem acesso = ignorado.
 *   depois   Profile.orgId (contrato padrão) e o primeiro vínculo ativo.
 */
/**
 * Id curto da URL (8 primeiros caracteres) → id completo. Dois contratos com o
 * mesmo começo: null (sem acesso), nunca um deles por sorte; aí só o completo
 * serve. Id completo ou outra coisa: volta igual.
 */
export async function expandirIdDoContrato(id: string): Promise<string | null> {
  if (!ehIdCurtoDeContrato(id)) return id;
  const orgs = await prisma.organization.findMany({
    where: { id: { startsWith: id.toLowerCase() } },
    select: { id: true },
    take: 2,
  });
  return orgs.length === 1 ? orgs[0].id : null;
}

export async function resolverContratoAtivo(
  pessoa: Pessoa,
  pedido: string | null | undefined,
  cookie: string | null | undefined
): Promise<ResultadoDoContrato> {
  if (pedido) {
    const completo = await expandirIdDoContrato(pedido);
    const acesso = completo ? await acessoAoContrato(pessoa, completo) : null;
    return acesso ? { ok: true, acesso } : { ok: false, motivo: "sem_acesso" };
  }

  const candidatos = [...new Set([cookie, pessoa.profileOrgId].filter((c): c is string => !!c))];
  for (const c of candidatos) {
    if (c !== pessoa.profileOrgId && !ehIdCompletoDeContrato(c)) continue;
    const acesso = await acessoAoContrato(pessoa, c);
    if (acesso) return { ok: true, acesso };
  }

  const primeiro = await prisma.membership
    .findFirst({
      where: { userId: pessoa.id, status: { in: STATUS_COM_ACESSO } },
      orderBy: { createdAt: "asc" },
      select: { orgId: true },
    })
    .catch(() => null);
  if (primeiro) {
    const acesso = await acessoAoContrato(pessoa, primeiro.orgId);
    if (acesso) return { ok: true, acesso };
  }
  return { ok: false, motivo: "sem_contrato" };
}

// --- Contratos da pessoa ----------------------------------------------------

export interface ContratoResumo {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** Contratos que a pessoa pode abrir (para o seletor do menu). */
export async function contratosDaPessoa(pessoa: { id: string; profileOrgId: string }): Promise<ContratoResumo[]> {
  const select = { id: true, name: true, logoUrl: true } as const;
  return comFallbackLegado(
    async () => {
      const vinculos = await prisma.membership.findMany({
        where: { userId: pessoa.id },
        select: { orgId: true, status: true, organization: { select } },
        orderBy: { createdAt: "asc" },
      });
      const lista: ContratoResumo[] = vinculos
        .filter((v) => STATUS_COM_ACESSO.includes(v.status))
        .map((v) => v.organization);
      // Contrato padrão sem vínculo nenhum (antes do backfill) continua na lista.
      if (!vinculos.some((v) => v.orgId === pessoa.profileOrgId)) {
        const padrao = await prisma.organization.findUnique({ where: { id: pessoa.profileOrgId }, select });
        if (padrao) lista.unshift(padrao);
      }
      return lista.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
    async () => {
      const padrao = await prisma.organization.findUnique({ where: { id: pessoa.profileOrgId }, select });
      return padrao ? [padrao] : [];
    }
  );
}

// --- Membros do contrato ----------------------------------------------------

/**
 * Filtro de Profile "é membro deste contrato": vínculo com acesso, ou contrato
 * padrão sem vínculo nenhum (legado). Quem foi removido fica de fora.
 */
export function whereMembrosDoContrato(orgId: string): Prisma.ProfileWhereInput {
  return {
    OR: [
      { memberships: { some: { orgId, status: { in: STATUS_COM_ACESSO } } } },
      { orgId, memberships: { none: { orgId } } },
    ],
  };
}

/** Lista de membros (perfis) do contrato, com fallback para antes do SQL. */
export async function membrosDoContrato<S extends Prisma.ProfileSelect>(
  orgId: string,
  select: S,
  extra?: { orderBy?: Prisma.ProfileOrderByWithRelationInput; take?: number; where?: Prisma.ProfileWhereInput }
): Promise<Prisma.ProfileGetPayload<{ select: S }>[]> {
  const base = { select, orderBy: extra?.orderBy, take: extra?.take };
  return comFallbackLegado(
    () => prisma.profile.findMany({ ...base, where: { AND: [whereMembrosDoContrato(orgId), extra?.where ?? {}] } }),
    () => prisma.profile.findMany({ ...base, where: { AND: [{ orgId }, extra?.where ?? {}] } })
  ) as Promise<Prisma.ProfileGetPayload<{ select: S }>[]>;
}

/** O perfil é membro (com acesso) do contrato? Usado para conferir responsável. */
export async function ehMembroDoContrato(orgId: string, userId: string): Promise<boolean> {
  const achou = await comFallbackLegado(
    () => prisma.profile.findFirst({ where: { AND: [{ id: userId }, whereMembrosDoContrato(orgId)] }, select: { id: true } }),
    () => prisma.profile.findFirst({ where: { id: userId, orgId }, select: { id: true } })
  );
  return !!achou;
}
