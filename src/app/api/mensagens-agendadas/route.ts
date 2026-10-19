import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { criarMensagemAgendada, listarAgendadas } from "@/lib/server/agendamento";

// ---------------------------------------------------------------------------
// Mensagem avulsa agendada para um contato ("mandar amanhã 9h"), a partir da
// conversa ou da ficha do negócio. Por baixo é um Broadcast kind="single";
// ver src/lib/server/agendamento.ts.
//
// GET  ?contactId=&dealId=&agentId=&channel=&to=  → as avulsas daquele contexto
// POST { agentId, channel, to, text, templateId?, scheduledAt, contactId?, dealId? }
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const q = new URL(request.url).searchParams;
  const agendadas = await listarAgendadas({
    orgId: ctx.orgId,
    contactRecordId: q.get("contactId"),
    dealId: q.get("dealId"),
    agentId: q.get("agentId"),
    channel: q.get("channel"),
    to: q.get("to"),
  });
  return NextResponse.json({ agendadas });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await criarMensagemAgendada({
    orgId: ctx.orgId,
    userId: ctx.userId,
    agentId: String(body.agentId ?? ""),
    channel: String(body.channel ?? ""),
    to: String(body.to ?? ""),
    text: typeof body.text === "string" ? body.text : "",
    templateId: typeof body.templateId === "string" && body.templateId ? body.templateId : null,
    contactRecordId: typeof body.contactId === "string" && body.contactId ? body.contactId : null,
    dealId: typeof body.dealId === "string" && body.dealId ? body.dealId : null,
    quando: new Date(String(body.scheduledAt ?? "")),
  });

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({
    ok: true,
    id: r.broadcast.id,
    scheduledAt: r.broadcast.scheduledAt?.toISOString() ?? null,
  });
}
