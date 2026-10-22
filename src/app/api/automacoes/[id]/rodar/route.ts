import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { inscreverManualmente } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// "Rodar agora": inscreve à mão um ou vários registros (até 500).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { objetoIds?: unknown };
  const ids = Array.isArray(b.objetoIds) ? b.objetoIds.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (!ids.length) return NextResponse.json({ error: "Escolha pelo menos um registro." }, { status: 400 });
  try {
    return NextResponse.json(await inscreverManualmente(ctx.orgId, id, ids, ctx.userId));
  } catch (e) {
    return respostaDoErro(e);
  }
}
