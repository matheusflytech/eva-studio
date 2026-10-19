import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { cancelarAgendado, reagendar } from "@/lib/server/agendamento";

// Cancelar ou mudar a hora de uma campanha agendada, enquanto ela não começou.
// Body: { acao: "cancelar" } ou { scheduledAt: "<ISO>" }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ agentId: string; broadcastId: string }> }
) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { broadcastId } = await params;

  const body = (await request.json().catch(() => ({}))) as { acao?: string; scheduledAt?: string };

  const r =
    body.acao === "cancelar"
      ? await cancelarAgendado(broadcastId, ctx.orgId, "campaign")
      : body.scheduledAt
        ? await reagendar(broadcastId, ctx.orgId, new Date(body.scheduledAt), "campaign")
        : ({ ok: false, status: 400, erro: "Diga se é para cancelar ou a nova hora." } as const);

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}
