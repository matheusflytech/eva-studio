import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { segredoDoEndpoint } from "@/lib/server/webhooks/endpoints";
import { respostaDoErro } from "../../erro";

// Mostrar (para colar no n8n) ou trocar o segredo da assinatura.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const segredo = await segredoDoEndpoint(ctx.orgId, id, body?.acao === "trocar");
    if (!segredo) return NextResponse.json({ error: "Webhook não encontrado." }, { status: 404 });
    return NextResponse.json({ secret: segredo }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return respostaDoErro(e);
  }
}
