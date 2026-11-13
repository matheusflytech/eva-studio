import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { caminhoDaOrg } from "@/lib/server/storage";
import { ehTabelaAusente } from "@/lib/server/contratos";
import { lerModelo } from "@/lib/disparos/modelo";
import type { Prisma } from "@/generated/prisma/client";

// Modelos de disparo do contrato (app de disparos).
// GET  → lista   ·   POST { name, text, options?, media? } → cria

const SEM_TABELA = "Os modelos ainda não foram ativados no banco deste ambiente (SQL 2026-11-13-broadcast-templates.sql).";

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const modelos = await prisma.broadcastTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ modelos });
  } catch (e) {
    if (ehTabelaAusente(e)) return NextResponse.json({ modelos: [], aviso: SEM_TABELA });
    throw e;
  }
}

export async function POST(request: Request) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const r = lerModelo(await request.json().catch(() => null), (p) => caminhoDaOrg(p, ctx.orgId));
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  try {
    const modelo = await prisma.broadcastTemplate.create({
      data: { ...r.modelo, options: r.modelo.options as unknown as Prisma.InputJsonValue, orgId: ctx.orgId },
    });
    return NextResponse.json({ modelo }, { status: 201 });
  } catch (e) {
    if (ehTabelaAusente(e)) return NextResponse.json({ error: SEM_TABELA }, { status: 409 });
    throw e;
  }
}
