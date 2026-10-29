import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { recordTouch } from "@/lib/server/marketing";
import { CHANNEL_LABEL, MANUAL_SOURCES, normalizeUtm, type TouchChannel } from "@/lib/marketing/touch";

// Origem de um contato (?contactId=) ou de um negócio (?dealId=), para a ficha.
// POST grava uma origem manual (Indicação, Evento...); com dealId ela passa a
// ser a origem do negócio: a correção feita por uma pessoa vale mais que a regra.

const TP = { id: true, at: true, channel: true, paid: true, utmSource: true, utmCampaign: true } as const;
type Tp = { id: string; at: Date; channel: string; paid: boolean; utmSource: string | null; utmCampaign: string | null };
const view = (t: Tp | null | undefined) => (t ? { ...t, label: CHANNEL_LABEL[t.channel as TouchChannel] ?? t.channel } : null);

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const dealId = q.get("dealId");
  const ctx = await requirePermission(dealId ? "negocios:ver" : "contatos:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (dealId) {
    const o = await prisma.dealOrigin.findFirst({ where: { dealId, orgId: ctx.orgId }, select: { touchpoint: { select: TP }, first: { select: TP } } });
    return NextResponse.json({ last: view(o?.touchpoint), first: view(o?.first) });
  }
  const contactId = q.get("contactId") ?? "";
  const touches = await prisma.touchpoint.findMany({ where: { orgId: ctx.orgId, contactId }, orderBy: { at: "asc" }, select: TP });
  return NextResponse.json({ last: view(touches.at(-1)), first: view(touches[0]) });
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const dealId = typeof b.dealId === "string" ? b.dealId : null;
  const ctx = await requirePermission(dealId ? "negocios:editar" : "contatos:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const source = normalizeUtm(b.source);
  if (!source || !MANUAL_SOURCES.some((s) => s.value === source)) return NextResponse.json({ error: "Escolha a origem." }, { status: 400 });

  // Negócio: a origem fica no contato principal dele (o primeiro ligado).
  let contactId = typeof b.contactId === "string" ? b.contactId : "";
  if (dealId) {
    const dc = await prisma.dealContact.findFirst({ where: { dealId, deal: { orgId: ctx.orgId } }, select: { contactId: true } });
    if (!dc) return NextResponse.json({ error: "O negócio precisa de um contato para ter origem." }, { status: 400 });
    contactId = dc.contactId;
  }
  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const touchId = await recordTouch(ctx.orgId, contact.id, { channel: "manual", utmSource: source, utmCampaign: normalizeUtm(b.campaign), paid: false });
  if (dealId) {
    await prisma.dealOrigin.upsert({
      where: { dealId },
      create: { dealId, orgId: ctx.orgId, touchpointId: touchId, firstTouchpointId: touchId },
      update: { touchpointId: touchId },
    });
  }
  return NextResponse.json({ id: touchId }, { status: 201 });
}
