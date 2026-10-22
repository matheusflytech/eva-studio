import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ENTIDADES_DA_LIXEIRA, type EntidadeDaLixeira } from "@/lib/lixeira";
import type { ModuloComEscopo, PermissaoGranular } from "@/lib/permissoes/catalogo";
import { ErroDaLixeira, apagarComLixeira, type ItemDaLixeira } from "@/lib/server/lixeira";
import { ctxPode, type SessionContext } from "@/lib/server/permissions";
import { donosVisiveis } from "@/lib/server/escopo-dados";

/** Ver e restaurar da lixeira = poder apagar aquele tipo de registro (no escopo do papel). */
const REGRAS: Record<EntidadeDaLixeira, { apagar: PermissaoGranular; escopo: ModuloComEscopo | null }> = {
  deal: { apagar: "negocios:apagar", escopo: "negocios" },
  contact: { apagar: "contatos:apagar", escopo: "contatos" },
  company: { apagar: "empresas:gerenciar", escopo: null },
};

type Ctx = Pick<SessionContext, "userId" | "orgId" | "role" | "permissoes" | "escopo">;

/** Por entidade que a pessoa pode ver na lixeira: null = todas; lista = donos visíveis. */
export async function entidadesVisiveis(ctx: Ctx): Promise<Partial<Record<EntidadeDaLixeira, string[] | null>>> {
  const r: Partial<Record<EntidadeDaLixeira, string[] | null>> = {};
  for (const e of ENTIDADES_DA_LIXEIRA) {
    const regra = REGRAS[e];
    if (!ctxPode(ctx, regra.apagar)) continue;
    r[e] = regra.escopo ? await donosVisiveis(ctx, regra.escopo) : null;
  }
  return r;
}

/** A pessoa enxerga este item? (Sempre enxerga o que ela mesma apagou.) */
export async function podeVerItem(ctx: Ctx, item: Pick<ItemDaLixeira, "entity" | "ownerId" | "deletedById">): Promise<boolean> {
  const visiveis = await entidadesVisiveis(ctx);
  const donos = visiveis[item.entity as EntidadeDaLixeira];
  if (donos === undefined) return false;
  if (donos === null || item.deletedById === ctx.userId) return true;
  return !!item.ownerId && donos.includes(item.ownerId);
}

// Resposta comum das rotas internas DELETE (negócio, contato, empresa).
//
//   200 { ok, lixeira: { id, expiresAt } | null, aviso }  — foi para a lixeira
//       (ou, com ?definitivo=1 e sem a lixeira no banco, apagou de vez + aviso)
//   409 { codigo: "lixeira_indisponivel" } — sem a lixeira no banco: a tela
//       pede confirmação e manda de novo com ?definitivo=1.

/** Nome de quem apagou, guardado na foto (a pessoa pode sair do contrato depois). */
export async function nomeDeQuem(userId: string): Promise<string> {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { name: true, email: true } }).catch(() => null);
  return p?.name || p?.email || "";
}

export async function responderExclusao(
  request: Request,
  ctx: { orgId: string; userId: string },
  entidade: EntidadeDaLixeira,
  id: string
): Promise<NextResponse> {
  const definitivo = new URL(request.url).searchParams.get("definitivo") === "1";
  try {
    const r = await apagarComLixeira({
      orgId: ctx.orgId,
      entidade,
      id,
      quem: { id: ctx.userId, nome: await nomeDeQuem(ctx.userId) },
      seIndisponivel: definitivo ? "apagar" : "recusar",
    });
    return NextResponse.json({
      ok: true,
      lixeira: r.lixeira ? { id: r.trashId, expiresAt: r.expiresAt.toISOString() } : null,
      aviso: r.aviso,
    });
  } catch (e) {
    if (e instanceof ErroDaLixeira) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
