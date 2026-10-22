import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo, texto } from "@/lib/server/api-validacao";
import { ErroDeTarefa, quickAdd } from "@/lib/server/tarefas";

// POST /api/tasks/rapida { texto: "ligar João amanhã 14h", contactId?, dealId? }
// Quick add em linguagem natural (parser em src/lib/tarefas/quick-add.ts).
export async function POST(request: Request) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const t = texto(body.texto, 500) ?? "";
  if (!t) return erro("Escreva o que fazer.");
  try {
    const r = await quickAdd(ctx, t, {
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      dealId: typeof body.dealId === "string" ? body.dealId : null,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeTarefa) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
