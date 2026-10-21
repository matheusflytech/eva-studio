import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { criarEndpoint, serializarEndpoint } from "@/lib/server/webhooks/endpoints";
import { respostaDoErro } from "./erro";

// Webhooks de saída do contrato (Integrações → n8n e webhooks).

export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const lista = await prisma.webhookEndpoint.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ disponivel: true, webhooks: lista.map(serializarEndpoint) });
  } catch {
    return NextResponse.json({ disponivel: false, webhooks: [] });
  }
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  try {
    const { endpoint, segredo } = await criarEndpoint(ctx.orgId, {
      url: body?.url,
      eventos: body?.events,
      descricao: body?.description,
      origem: "tela",
      createdById: ctx.userId,
    });
    return NextResponse.json({ webhook: serializarEndpoint(endpoint), secret: segredo });
  } catch (e) {
    return respostaDoErro(e);
  }
}
