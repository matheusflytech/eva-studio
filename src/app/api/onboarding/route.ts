import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { aplicarPacote } from "@/lib/server/onboarding";
import { PACOTE_POR_ID } from "@/lib/niche-packs";

// Configuração inicial guiada.
//   GET   diz se a conta já passou por ela
//   POST  { pacote, empresa }  cria funil, campos e atendimento do pacote
//   PATCH { pular: true }      marca como feita sem criar nada

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true, onboardedAt: true } });
  return NextResponse.json({ feito: !!org?.onboardedAt, empresa: org?.name ?? "" });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const pacote = PACOTE_POR_ID.get(String(body.pacote ?? ""));
  if (!pacote) return NextResponse.json({ error: "Escolha um tipo de negócio." }, { status: 400 });

  try {
    const resumo = await aplicarPacote(ctx.orgId, pacote, String(body.empresa ?? ""));
    await prisma.organization.update({ where: { id: ctx.orgId }, data: { onboardedAt: new Date() } });
    return NextResponse.json({ resumo });
  } catch (err) {
    console.error("[onboarding]", err);
    return NextResponse.json({ error: "Não foi possível montar o pacote. Nada foi perdido: tente de novo." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  if (body.pular === true) {
    await prisma.organization.update({ where: { id: ctx.orgId }, data: { onboardedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
