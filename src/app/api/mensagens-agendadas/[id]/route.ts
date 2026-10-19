import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { cancelarAgendado, reagendar } from "@/lib/server/agendamento";

// PATCH { scheduledAt } muda a hora; DELETE cancela. Só enquanto não começou,
// e só mensagem avulsa (campanha é na tela de Disparos, com outra permissão).

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { scheduledAt?: string };
  const r = await reagendar(id, ctx.orgId, new Date(String(body.scheduledAt ?? "")), "single");
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const r = await cancelarAgendado(id, ctx.orgId, "single");
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}
