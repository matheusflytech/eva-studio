import "server-only";
import { prisma } from "@/lib/db/prisma";
import { diferencas, type Foto } from "@/lib/server/eventos/alteracoes";
import { registrarHistorico } from "@/lib/server/historico";
import type { AcaoDaConta, ObjetoDoHistorico } from "@/lib/historico/tipos";

// Ações da conta na auditoria: papéis, grupos de permissão e equipes. Foto
// antes e depois, já em nomes (grupo, líder, membros), e o histórico guarda só
// o que mudou. Membros e chaves de API gravam direto em membros.ts e nas rotas.

export interface FotoDaConta {
  nome: string;
  foto: Foto;
}

const ordenar = (l: string[]) => [...l].sort();

async function nomes(tabela: "permissionGroup" | "profile", orgId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const linhas =
    tabela === "permissionGroup"
      ? await prisma.permissionGroup.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, name: true } })
      : await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const m = new Map(linhas.map((l) => [l.id, l.name]));
  return ordenar(ids.map((id) => m.get(id) ?? "removido"));
}

export async function fotoDoPapel(orgId: string, id: string): Promise<FotoDaConta | null> {
  const p = await prisma.customRole.findFirst({ where: { id, orgId } });
  if (!p) return null;
  return {
    nome: p.name,
    foto: {
      nome: p.name,
      descricao: p.description,
      permissoes: ordenar(p.permissions),
      grupos: await nomes("permissionGroup", orgId, p.groupIds),
      escopo: p.dataScope ?? {},
    },
  };
}

export async function fotoDoGrupo(orgId: string, id: string): Promise<FotoDaConta | null> {
  const g = await prisma.permissionGroup.findFirst({ where: { id, orgId } });
  if (!g) return null;
  return { nome: g.name, foto: { nome: g.name, descricao: g.description, permissoes: ordenar(g.permissions) } };
}

export async function fotoDaEquipe(orgId: string, id: string): Promise<FotoDaConta | null> {
  const t = await prisma.team.findFirst({ where: { id, orgId }, include: { members: { select: { userId: true } } } });
  if (!t) return null;
  const [lider] = t.leaderId ? await nomes("profile", orgId, [t.leaderId]) : [null];
  return { nome: t.name, foto: { nome: t.name, lider, membros: await nomes("profile", orgId, t.members.map((m) => m.userId)) } };
}

/**
 * Grava a ação. Com `antes` e `depois` (alterou), só o que mudou; sem mudança
 * de fato, nada. Nunca lança (ler a foto pode falhar: aí grava sem detalhe).
 */
export async function registrarNaConta(
  orgId: string,
  acao: AcaoDaConta,
  objeto: ObjetoDoHistorico,
  objetoId: string,
  antes: FotoDaConta | null,
  depois: FotoDaConta | null
): Promise<void> {
  const mudancas = antes && depois ? diferencas(antes.foto, depois.foto) : null;
  if (mudancas && Object.keys(mudancas).length === 0) return;
  await registrarHistorico({ orgId, acao, objeto, objetoId, objetoNome: (depois ?? antes)?.nome ?? "", mudancas });
}

/** Foto que não derruba a rota: erro vira null. */
export function fotoSegura(p: Promise<FotoDaConta | null>): Promise<FotoDaConta | null> {
  return p.catch(() => null);
}
