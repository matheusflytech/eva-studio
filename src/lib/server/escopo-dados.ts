import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ModuloComEscopo } from "@/lib/permissoes/catalogo";
import type { SessionContext } from "@/lib/server/permissions";

// ---------------------------------------------------------------------------
// Escopo de dados do papel: "só os meus", "os da minha equipe" ou "todos",
// por módulo (negócios, contatos, conversas). Papel de sistema = todos (o
// comportamento de sempre). "Meu" = sou o responsável (ownerId) — na conversa,
// o atendente (assignedToId).
//
// Aplicado em: GET /api/deals, /api/deals/[dealId] (todos os métodos),
// /api/deals/exportar, GET /api/contacts, /api/contacts/[contactId] e
// GET /api/conversations. Onde ainda NÃO se aplica está listado em
// docs/superpowers/plans/2026-10-20-contratos-permissoes.md.
// ---------------------------------------------------------------------------

type Ctx = Pick<SessionContext, "userId" | "orgId" | "escopo">;

/** Donos visíveis para a pessoa; null = sem filtro (todos). */
export async function donosVisiveis(ctx: Ctx, modulo: ModuloComEscopo): Promise<string[] | null> {
  const escopo = ctx.escopo?.[modulo] ?? "todos";
  if (escopo === "todos") return null;
  if (escopo === "proprios") return [ctx.userId];
  // Equipe: eu + quem está em alguma equipe minha, só neste contrato.
  const colegas = await prisma.teamMember.findMany({
    where: { team: { orgId: ctx.orgId, members: { some: { userId: ctx.userId } } } },
    select: { userId: true },
  });
  return [...new Set([ctx.userId, ...colegas.map((c) => c.userId)])];
}

/** Pedaço de `where` para listas: {} (todos) ou { ownerId: { in: [...] } }. */
export async function filtroDeEscopo(
  ctx: Ctx,
  modulo: ModuloComEscopo,
  campo: "ownerId" | "assignedToId" = "ownerId"
): Promise<Record<string, { in: string[] }>> {
  const donos = await donosVisiveis(ctx, modulo);
  return donos ? { [campo]: { in: donos } } : {};
}

/** O registro (pelo responsável) está no escopo da pessoa? */
export async function noEscopo(ctx: Ctx, modulo: ModuloComEscopo, dono: string | null | undefined): Promise<boolean> {
  const donos = await donosVisiveis(ctx, modulo);
  return donos === null || (!!dono && donos.includes(dono));
}
