import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { parseLink } from "@/lib/server/marketing-input";
import { newCode } from "@/lib/marketing/touch";

// Links de WhatsApp rastreados (/w/CODE). O GET traz também os números de
// WhatsApp conectados no contrato, para escolher em vez de digitar.
export async function GET() {
  const ctx = await requirePermission("marketing:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;
  const [links, contacts, qr, meta, antigos] = await Promise.all([
    prisma.trackedLink.findMany({ where: { orgId }, orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 300 }),
    prisma.touchpoint.groupBy({ by: ["linkId"], where: { orgId, channel: "whatsapp_link", linkId: { not: null } }, _count: { contactId: true } }),
    prisma.canal.findMany({ where: { orgId, tipo: "whatsapp_qr" }, select: { id: true, rotulo: true, externalId: true, agentId: true } }),
    prisma.metaConnection.findMany({ where: { agent: { orgId } }, select: { agentId: true, displayPhone: true, agent: { select: { name: true } } } }),
    prisma.whatsAppConnection.findMany({ where: { agent: { orgId }, phoneNumber: { not: null } }, select: { agentId: true, phoneNumber: true, agent: { select: { name: true } } } }),
  ]);
  const qrPhones = qr.length
    ? await prisma.canalWhatsAppQr.findMany({ where: { canalId: { in: qr.map((c) => c.id) } }, select: { canalId: true, phoneNumber: true } })
    : [];
  const digits = (v: string | null | undefined) => (v ?? "").split(":")[0].replace(/\D/g, "");
  const numbers = [
    ...qr.map((c) => ({ label: c.rotulo || "WhatsApp", phone: digits(qrPhones.find((p) => p.canalId === c.id)?.phoneNumber ?? c.externalId), agentId: c.agentId })),
    ...meta.map((m) => ({ label: `${m.agent.name} (oficial)`, phone: digits(m.displayPhone), agentId: m.agentId })),
    ...antigos.map((w) => ({ label: w.agent.name, phone: digits(w.phoneNumber), agentId: w.agentId })),
  ].filter((n, i, all) => n.phone.length >= 10 && all.findIndex((x) => x.phone === n.phone) === i);
  const contatos = new Map(contacts.map((c) => [c.linkId, c._count.contactId]));
  return NextResponse.json({ links: links.map((l) => ({ ...l, contacts: contatos.get(l.id) ?? 0 })), numbers });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const r = parseLink(await request.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.agentId && !(await prisma.agent.findFirst({ where: { id: r.agentId, orgId: ctx.orgId }, select: { id: true } }))) r.agentId = null;
  // Código de 6 letras: colisão é rara; o índice único decide e tenta de novo.
  for (let i = 0; i < 3; i++) {
    try {
      const link = await prisma.trackedLink.create({ data: { orgId: ctx.orgId, code: newCode(6), ...r } });
      return NextResponse.json({ id: link.id, code: link.code }, { status: 201 });
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}
