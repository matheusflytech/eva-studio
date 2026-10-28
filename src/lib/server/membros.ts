import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_COM_ACESSO, comFallbackLegado, ehPapelDeSistema } from "@/lib/server/contratos";
import type { SessionContext } from "@/lib/server/permissions";
import { PAPEIS_DE_SISTEMA, type PapelDeSistema } from "@/lib/permissoes/catalogo";
import { registrarHistorico } from "@/lib/server/historico";
import { enviarLinkDoConvite } from "@/lib/server/convite";
import type { Mudancas } from "@/lib/historico/tipos";

// ---------------------------------------------------------------------------
// Membros de um contrato: listar, convidar, mudar papel/grupos/equipes e
// remover. Tudo sempre dentro de ctx.orgId (o contrato ativo já conferido).
//
// Travas (as mesmas de antes, agora por contrato):
//   - ninguém rebaixa nem remove a si mesmo;
//   - o contrato nunca fica sem dono;
//   - só dono (ou superadmin) cria dono ou mexe em quem é dono — "gerenciar
//     membros" num papel personalizado não vira atalho para tomar o contrato.
// ---------------------------------------------------------------------------

export class ErroDeMembro extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const nomeDoPapel = (p: string) => PAPEIS_DE_SISTEMA.find((x) => x.id === p)?.nome ?? p;

/** O que mudou no acesso, já em nomes (papel, papel personalizado, grupos, equipes). */
async function mudancasDoAcesso(
  orgId: string,
  antes: { role: string; roleId: string | null; groupIds: string[]; teamIds: string[] },
  depois: { role?: string; roleId?: string | null; groupIds?: string[]; teamIds?: string[] }
): Promise<Mudancas> {
  const m: Mudancas = {};
  const mesmos = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (depois.role !== undefined && depois.role !== antes.role) m.papel = { de: nomeDoPapel(antes.role), para: nomeDoPapel(depois.role) };
  const roleMudou = depois.roleId !== undefined && depois.roleId !== antes.roleId;
  const gruposMudaram = depois.groupIds !== undefined && !mesmos(depois.groupIds, antes.groupIds);
  const equipesMudaram = depois.teamIds !== undefined && !mesmos(depois.teamIds, antes.teamIds);
  if (!roleMudou && !gruposMudaram && !equipesMudaram) return m;
  const [papeis, grupos, equipes] = await Promise.all([
    roleMudou ? prisma.customRole.findMany({ where: { orgId, id: { in: [antes.roleId, depois.roleId].filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [],
    gruposMudaram ? prisma.permissionGroup.findMany({ where: { orgId, id: { in: [...antes.groupIds, ...depois.groupIds!] } }, select: { id: true, name: true } }) : [],
    equipesMudaram ? prisma.team.findMany({ where: { orgId, id: { in: [...antes.teamIds, ...depois.teamIds!] } }, select: { id: true, name: true } }) : [],
  ]);
  const nomes = new Map([...papeis, ...grupos, ...equipes].map((x) => [x.id, x.name]));
  const lista = (ids: string[]) => ids.map((id) => nomes.get(id) ?? "removido");
  if (roleMudou) m.papel_personalizado = { de: antes.roleId ? (nomes.get(antes.roleId) ?? "removido") : null, para: depois.roleId ? (nomes.get(depois.roleId) ?? "removido") : null };
  if (gruposMudaram) m.grupos = { de: lista(antes.groupIds), para: lista(depois.groupIds!) };
  if (equipesMudaram) m.equipes = { de: lista(antes.teamIds), para: lista(depois.teamIds!) };
  return m;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MembroDoContrato {
  id: string;
  name: string;
  email: string;
  avatarPath: string | null;
  role: PapelDeSistema;
  roleId: string | null;
  groupIds: string[];
  teamIds: string[];
  status: string;
  createdAt: string;
}

function papel(v: string): PapelDeSistema {
  // Perfil antigo sem papel válido gravado era dono (mesma regra da sessão).
  return ehPapelDeSistema(v) ? v : "owner";
}

/** Membros com acesso (ativos e convidados), convites pendentes + legado sem vínculo. */
export async function listarMembros(orgId: string): Promise<MembroDoContrato[]> {
  return comFallbackLegado(
    async () => {
      const [vinculos, legado, equipes] = await Promise.all([
        prisma.membership.findMany({
          where: { orgId, status: { in: [...STATUS_COM_ACESSO, "pendente"] } },
          include: { user: { select: { id: true, name: true, email: true, avatarPath: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.profile.findMany({
          where: { orgId, memberships: { none: { orgId } } },
          select: { id: true, name: true, email: true, avatarPath: true, role: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.teamMember.findMany({ where: { team: { orgId } }, select: { teamId: true, userId: true } }),
      ]);
      const equipesDe = (userId: string) => equipes.filter((e) => e.userId === userId).map((e) => e.teamId);
      return [
        ...legado.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          avatarPath: p.avatarPath,
          role: papel(p.role),
          roleId: null,
          groupIds: [],
          teamIds: equipesDe(p.id),
          status: "ativo",
          createdAt: p.createdAt.toISOString(),
        })),
        ...vinculos.map((v) => ({
          id: v.userId,
          name: v.user.name,
          email: v.user.email,
          avatarPath: v.user.avatarPath,
          role: papel(v.role),
          roleId: v.roleId,
          groupIds: v.groupIds ?? [],
          teamIds: equipesDe(v.userId),
          status: v.status,
          createdAt: v.createdAt.toISOString(),
        })),
      ];
    },
    async () => {
      const perfis = await prisma.profile.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
      return perfis.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        avatarPath: p.avatarPath,
        role: papel(p.role),
        roleId: null,
        groupIds: [],
        teamIds: [],
        status: "ativo",
        createdAt: p.createdAt.toISOString(),
      }));
    }
  );
}

async function donosDoContrato(orgId: string): Promise<number> {
  const membros = await listarMembros(orgId);
  return membros.filter((m) => m.role === "owner" && m.status !== "pendente").length;
}

function ehDono(ctx: SessionContext) {
  return ctx.role === "owner" || !!ctx.superadmin;
}

/** Garante a linha do vínculo (cria a partir do legado se ainda não existe). */
async function garantirVinculo(orgId: string, userId: string, papelAtual: PapelDeSistema) {
  return prisma.membership.upsert({
    where: { orgId_userId: { orgId, userId } },
    create: { orgId, userId, role: papelAtual, status: "ativo" },
    update: {},
  });
}

export interface AlteracaoDeMembro {
  userId: unknown;
  role?: unknown;
  roleId?: unknown;
  groupIds?: unknown;
  teamIds?: unknown;
}

export async function alterarMembro(ctx: SessionContext, input: AlteracaoDeMembro) {
  const userId = typeof input.userId === "string" ? input.userId : "";
  if (!userId) throw new ErroDeMembro("Informe o membro.");
  const membros = await listarMembros(ctx.orgId);
  const alvo = membros.find((m) => m.id === userId);
  if (!alvo) throw new ErroDeMembro("Membro não encontrado.", 404);

  const novoPapel = input.role === undefined ? undefined : input.role;
  if (novoPapel !== undefined && !ehPapelDeSistema(novoPapel)) throw new ErroDeMembro("Papel inválido.");

  // O próprio acesso ninguém mexe: rebaixar perderia o acesso no clique, e
  // subir (papel/grupo com mais permissão) seria escalada por conta própria.
  if (
    alvo.id === ctx.userId &&
    ((novoPapel !== undefined && novoPapel !== alvo.role) || input.roleId !== undefined || input.groupIds !== undefined)
  ) {
    throw new ErroDeMembro("Você não pode mudar o próprio acesso.");
  }
  if (novoPapel !== undefined && novoPapel !== alvo.role) {
    if ((novoPapel === "owner" || alvo.role === "owner") && !ehDono(ctx)) {
      throw new ErroDeMembro("Só o dono do contrato muda quem é dono.", 403);
    }
    if (alvo.role === "owner" && novoPapel !== "owner" && (await donosDoContrato(ctx.orgId)) <= 1) {
      throw new ErroDeMembro("O contrato precisa de pelo menos um dono.");
    }
  }
  if (alvo.role === "owner" && !ehDono(ctx) && (input.roleId !== undefined || input.groupIds !== undefined)) {
    throw new ErroDeMembro("Só o dono do contrato mexe no acesso de outro dono.", 403);
  }

  // Papel personalizado, grupos e equipes só valem se forem deste contrato.
  let roleId: string | null | undefined;
  if (input.roleId !== undefined) {
    if (input.roleId === null || input.roleId === "") roleId = null;
    else if (typeof input.roleId === "string") {
      const r = await prisma.customRole.findFirst({ where: { id: input.roleId, orgId: ctx.orgId }, select: { id: true } });
      if (!r) throw new ErroDeMembro("Papel personalizado não encontrado neste contrato.", 404);
      roleId = r.id;
    } else throw new ErroDeMembro("Papel personalizado inválido.");
  }
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : null);
  let groupIds: string[] | undefined;
  if (input.groupIds !== undefined) {
    const pedidos = ids(input.groupIds);
    if (!pedidos) throw new ErroDeMembro("Grupos inválidos.");
    const achados = await prisma.permissionGroup.findMany({ where: { orgId: ctx.orgId, id: { in: pedidos } }, select: { id: true } });
    groupIds = achados.map((g) => g.id);
  }
  let teamIds: string[] | undefined;
  if (input.teamIds !== undefined) {
    const pedidos = ids(input.teamIds);
    if (!pedidos) throw new ErroDeMembro("Equipes inválidas.");
    const achadas = await prisma.team.findMany({ where: { orgId: ctx.orgId, id: { in: pedidos } }, select: { id: true } });
    teamIds = achadas.map((t) => t.id);
  }

  await comFallbackLegado(
    async () => {
      await garantirVinculo(ctx.orgId, alvo.id, alvo.role);
      await prisma.membership.update({
        where: { orgId_userId: { orgId: ctx.orgId, userId: alvo.id } },
        data: {
          ...(novoPapel !== undefined ? { role: novoPapel } : {}),
          ...(roleId !== undefined ? { roleId } : {}),
          ...(groupIds !== undefined ? { groupIds } : {}),
        },
      });
      if (teamIds !== undefined) {
        await prisma.$transaction([
          prisma.teamMember.deleteMany({ where: { userId: alvo.id, team: { orgId: ctx.orgId }, teamId: { notIn: teamIds } } }),
          ...teamIds.map((teamId) =>
            prisma.teamMember.upsert({
              where: { teamId_userId: { teamId, userId: alvo.id } },
              create: { teamId, userId: alvo.id },
              update: {},
            })
          ),
        ]);
      }
    },
    async () => {
      if (roleId || groupIds?.length || teamIds?.length) {
        throw new ErroDeMembro("Papéis personalizados, grupos e equipes precisam do SQL de contratos aplicado.", 409);
      }
    }
  );

  // Contrato padrão da pessoa: Profile.role acompanha (compatibilidade).
  if (novoPapel !== undefined) {
    await prisma.profile.updateMany({ where: { id: alvo.id, orgId: ctx.orgId }, data: { role: novoPapel } });
  }

  const mudancas = await mudancasDoAcesso(ctx.orgId, alvo, { role: novoPapel, roleId, groupIds, teamIds }).catch(() => ({}));
  if (Object.keys(mudancas).length > 0) {
    await registrarHistorico({ orgId: ctx.orgId, acao: "membro.mudou_acesso", objeto: "member", objetoId: alvo.id, objetoNome: alvo.name || alvo.email, mudancas, detalhes: { email: alvo.email } });
  }
}

export async function removerMembro(ctx: SessionContext, userId: string) {
  if (!userId) throw new ErroDeMembro("Informe o membro.");
  if (userId === ctx.userId) throw new ErroDeMembro("Você não pode remover a si mesmo.");
  const membros = await listarMembros(ctx.orgId);
  const alvo = membros.find((m) => m.id === userId);
  if (!alvo) throw new ErroDeMembro("Membro não encontrado.", 404);
  if (alvo.role === "owner") {
    if (!ehDono(ctx)) throw new ErroDeMembro("Só o dono do contrato remove outro dono.", 403);
    if ((await donosDoContrato(ctx.orgId)) <= 1) throw new ErroDeMembro("O contrato precisa de pelo menos um dono.");
  }
  // Não apaga a linha: "removido" é o que impede o acesso pelo contrato padrão
  // (Profile.orgId). Os dados que a pessoa criou continuam no contrato.
  await comFallbackLegado(
    async () => {
      await prisma.membership.upsert({
        where: { orgId_userId: { orgId: ctx.orgId, userId } },
        create: { orgId: ctx.orgId, userId, role: alvo.role, status: "removido" },
        update: { status: "removido" },
      });
      await prisma.teamMember.deleteMany({ where: { userId, team: { orgId: ctx.orgId } } });
    },
    async () => {
      throw new ErroDeMembro("Remover membros precisa do SQL de contratos aplicado.", 409);
    }
  );
  await registrarHistorico({ orgId: ctx.orgId, acao: "membro.removeu", objeto: "member", objetoId: alvo.id, objetoNome: alvo.name || alvo.email, detalhes: { email: alvo.email, papel: nomeDoPapel(alvo.role) } });
}

export interface Convite {
  email: unknown;
  name?: unknown;
  role?: unknown;
  roleId?: unknown;
}

/**
 * Convida por e-mail. Já tem conta no Eva: o vínculo fica "pendente" até a
 * pessoa aceitar pelo link do e-mail (ver convite.ts). Não tem: o Supabase manda o convite (a pessoa define a
 * senha pelo link) e o perfil nasce com este contrato como padrão.
 */
export async function convidarMembro(ctx: SessionContext, input: Convite, origem: string) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new ErroDeMembro("E-mail inválido.");
  const role = input.role === undefined ? "agent" : input.role;
  if (!ehPapelDeSistema(role)) throw new ErroDeMembro("Papel inválido.");
  if (role === "owner" && !ehDono(ctx)) throw new ErroDeMembro("Só o dono do contrato convida outro dono.", 403);
  let roleId: string | null = null;
  if (typeof input.roleId === "string" && input.roleId) {
    const r = await prisma.customRole.findFirst({ where: { id: input.roleId, orgId: ctx.orgId }, select: { id: true } });
    if (!r) throw new ErroDeMembro("Papel personalizado não encontrado neste contrato.", 404);
    roleId = r.id;
  }
  const nome = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 200) : email.split("@")[0];

  const existente = await prisma.profile.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, orgId: true },
  });

  if (existente) {
    const membros = await listarMembros(ctx.orgId);
    // Pendente pode ser convidado de novo: reenvia o link.
    if (membros.some((m) => m.id === existente.id && m.status !== "pendente")) throw new ErroDeMembro("Essa pessoa já participa do contrato.", 409);
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: ctx.orgId, userId: existente.id } },
      create: { orgId: ctx.orgId, userId: existente.id, role, roleId, status: "pendente", invitedById: ctx.userId },
      update: { role, roleId, status: "pendente", invitedById: ctx.userId, groupIds: [] },
    });
    const erroDoEnvio = await enviarLinkDoConvite(email, ctx.orgId, existente.id, origem);
    if (erroDoEnvio) throw new ErroDeMembro(`Convite salvo, mas o e-mail não saiu: ${erroDoEnvio}. Tente convidar de novo.`, 502);
    await registrarHistorico({ orgId: ctx.orgId, acao: "membro.convidou", objeto: "member", objetoId: existente.id, objetoNome: nome, detalhes: { email, papel: nomeDoPapel(role) } });
    return { userId: existente.id, email, novo: false };
  }

  // Conta nova nasce sem senha e segue o mesmo caminho de quem já tem conta:
  // o link abre /invite, a pessoa define a senha e já entra no contrato.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data?.user) {
    throw new ErroDeMembro(error?.message ? `Não foi possível enviar o convite: ${error.message}` : "Não foi possível enviar o convite.");
  }
  const userId = data.user.id;
  try {
    await prisma.$transaction([
      prisma.profile.create({ data: { id: userId, orgId: ctx.orgId, name: nome, email, role } }),
      prisma.membership.create({
        data: { orgId: ctx.orgId, userId, role, roleId, status: "pendente", invitedById: ctx.userId },
      }),
    ]);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw e;
  }
  const erroDoEnvio = await enviarLinkDoConvite(email, ctx.orgId, userId, origem);
  if (erroDoEnvio) throw new ErroDeMembro(`Convite salvo, mas o e-mail não saiu: ${erroDoEnvio}. Tente convidar de novo.`, 502);
  await registrarHistorico({ orgId: ctx.orgId, acao: "membro.convidou", objeto: "member", objetoId: userId, objetoNome: nome, detalhes: { email, papel: nomeDoPapel(role) } });
  return { userId, email, novo: true };
}
