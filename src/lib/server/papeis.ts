import "server-only";
import { prisma } from "@/lib/db/prisma";
import { limparEscopos, limparPermissoes } from "@/lib/permissoes/catalogo";
import { membrosDoContrato } from "@/lib/server/contratos";

// Papéis personalizados, grupos de permissões e equipes: validação comum às
// rotas /api/roles, /api/permission-groups e /api/teams. Tudo preso ao
// contrato: id de grupo/membro de outro contrato é descartado em silêncio.

export type Corpo = Record<string, unknown>;

export function nomeValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const n = v.trim();
  return n && n.length <= 80 ? n : null;
}

export function descricao(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

function listaDeIds(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
}

export async function gruposDoContrato(orgId: string, v: unknown): Promise<string[]> {
  const ids = listaDeIds(v);
  if (ids.length === 0) return [];
  const achados = await prisma.permissionGroup.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } });
  return achados.map((g) => g.id);
}

export async function membrosValidos(orgId: string, v: unknown): Promise<string[]> {
  const ids = listaDeIds(v);
  if (ids.length === 0) return [];
  const achados = await membrosDoContrato(orgId, { id: true }, { where: { id: { in: ids } } });
  return achados.map((p) => p.id);
}

/** Campos de papel personalizado a partir do corpo (só os que vieram). */
export async function dadosDoPapel(orgId: string, body: Corpo, criando: boolean) {
  const dados: {
    name?: string;
    description?: string;
    permissions?: string[];
    groupIds?: string[];
    dataScope?: ReturnType<typeof limparEscopos>;
  } = {};
  if (criando || body.name !== undefined) {
    const n = nomeValido(body.name);
    if (!n) return { erro: "Dê um nome ao papel (até 80 caracteres)." };
    dados.name = n;
  }
  if (body.description !== undefined) dados.description = descricao(body.description);
  if (criando || body.permissions !== undefined) dados.permissions = limparPermissoes(body.permissions);
  if (body.groupIds !== undefined) dados.groupIds = await gruposDoContrato(orgId, body.groupIds);
  if (criando || body.dataScope !== undefined) dados.dataScope = limparEscopos(body.dataScope);
  return { dados };
}
