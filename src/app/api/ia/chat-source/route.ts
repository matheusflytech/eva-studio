import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// De quem é a chave do chat da Eva neste contrato: "eva" (da plataforma, padrão)
// ou "contract" (a cadastrada em Integrações). Só quem gerencia integrações muda.

export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { chatAiSource: true } }).catch(() => null);
  return NextResponse.json({ source: org?.chatAiSource === "contract" ? "contract" : "eva", disponivel: !!org });
}

export async function PUT(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = (await request.json().catch(() => null)) as { source?: unknown } | null;
  if (body?.source !== "eva" && body?.source !== "contract") {
    return NextResponse.json({ error: 'Envie { source: "eva" | "contract" }.' }, { status: 400 });
  }
  try {
    await prisma.organization.update({ where: { id: ctx.orgId }, data: { chatAiSource: body.source } });
  } catch {
    return NextResponse.json({ error: "A opção ainda não foi ativada no banco. Peça para aplicarem o SQL 2026-11-08-chat-ai-source.sql." }, { status: 409 });
  }
  return NextResponse.json({ source: body.source });
}
