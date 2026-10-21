import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { trocarAgenteDoCanal, type TipoDeCanal } from "@/lib/server/canais-do-contrato";

// Troca o agente que atende por um canal: { tipo, de, para }.
export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const tipo = String(body?.tipo ?? "") as TipoDeCanal;
  const de = String(body?.de ?? "");
  const para = String(body?.para ?? "");
  if (!tipo || !de || !para) return NextResponse.json({ error: "Envie { tipo, de, para }." }, { status: 400 });

  const r = await trocarAgenteDoCanal(ctx.orgId, tipo, de, para);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, aviso: r.aviso ?? null });
}
