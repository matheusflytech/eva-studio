import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { lerModelo } from "./validar";

// Modelos de e-mail do contrato (Biblioteca → Modelos de e-mail).

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const modelos = await prisma.emailModelo.findMany({ where: { orgId: ctx.orgId }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ disponivel: true, modelos });
  } catch {
    return NextResponse.json({ disponivel: false, modelos: [] });
  }
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const lido = lerModelo(await request.json().catch(() => null));
  if ("error" in lido) return NextResponse.json({ error: lido.error }, { status: 400 });
  try {
    const modelo = await prisma.emailModelo.create({ data: { orgId: ctx.orgId, ...lido } });
    return NextResponse.json({ modelo });
  } catch {
    return NextResponse.json({ error: "O e-mail ainda não foi ativado no banco deste ambiente (SQL 2026-10-22-email.sql)." }, { status: 409 });
  }
}
