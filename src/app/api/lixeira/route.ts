import { NextResponse } from "next/server";
import { ctxPode, requirePermission } from "@/lib/server/permissions";
import { ehEntidadeDaLixeira } from "@/lib/lixeira";
import {
  ErroDaLixeira,
  apagarParaSempre,
  lerItemDaLixeira,
  listarLixeira,
  restaurarDaLixeira,
  type ItemDaLixeira,
} from "@/lib/server/lixeira";
import { entidadesVisiveis, podeVerItem } from "@/lib/server/lixeira-http";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";

// Lixeira (Configurações → Lixeira).
//
// GET  ?busca=&tipo=deal|contact|company — itens que a pessoa pode ver (os
//      tipos que ela pode apagar, no escopo do papel; sempre o que ela apagou).
// POST { acao: "restaurar", id }          — mesma regra de quem vê.
// POST { acao: "apagar_para_sempre", id } — e ainda "lixeira:esvaziar".

function serializar(i: ItemDaLixeira) {
  return {
    id: i.id,
    entidade: i.entity,
    entityId: i.entityId,
    nome: i.name,
    detalhe: i.detail,
    apagadoPor: i.deletedByName,
    apagadoEm: i.deletedAt.toISOString(),
    expiraEm: i.expiresAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const tipo = sp.get("tipo");
  const entidades = await entidadesVisiveis(ctx);
  const r = await listarLixeira(ctx.orgId, {
    entidades,
    userId: ctx.userId,
    busca: (sp.get("busca") ?? "").slice(0, 200),
    tipo: ehEntidadeDaLixeira(tipo) ? tipo : null,
  });
  return NextResponse.json({
    disponivel: r.disponivel,
    tipos: Object.keys(entidades),
    podeApagarParaSempre: ctxPode(ctx, "lixeira:esvaziar"),
    itens: r.itens.map(serializar),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const acao = body.acao;
  const id = typeof body.id === "string" ? body.id : "";
  if ((acao !== "restaurar" && acao !== "apagar_para_sempre") || !id) return erro("Ação inválida.");

  // Item de outra org ou fora do escopo da pessoa: "não existe".
  const item = await lerItemDaLixeira(ctx.orgId, id);
  if (!item || !(await podeVerItem(ctx, item))) return erro("Item não encontrado na lixeira.", 404);

  if (acao === "apagar_para_sempre") {
    if (!ctxPode(ctx, "lixeira:esvaziar")) return erro("Só dono ou administrador pode apagar para sempre.", 403);
    await apagarParaSempre(ctx.orgId, item.id);
    return NextResponse.json({ ok: true });
  }

  try {
    const r = await restaurarDaLixeira(ctx.orgId, item.id);
    return NextResponse.json({ ok: true, entidade: r.entidade, entityId: r.entityId, nome: r.nome, avisos: r.avisos });
  } catch (e) {
    if (e instanceof ErroDaLixeira) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
