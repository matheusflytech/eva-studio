import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { serializarEntrega } from "@/lib/server/webhooks/endpoints";
import { respostaDoErro } from "../../erro";

const STATUS = new Set(["pendente", "entregue", "falhou", "cancelada"]);

// Log das entregas de um webhook (últimas 50, filtro opcional por status).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const status = new URL(request.url).searchParams.get("status");
  try {
    const entregas = await prisma.webhookEntrega.findMany({
      where: { endpointId: id, orgId: ctx.orgId, ...(status && STATUS.has(status) ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ entregas: entregas.map(serializarEntrega) });
  } catch (e) {
    return respostaDoErro(e);
  }
}
