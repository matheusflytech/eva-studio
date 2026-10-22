import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Busca de registros para "Testar com" e "Rodar agora" (até 20 por busca).
export async function GET(request: Request) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const objeto = sp.get("objeto");
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const contem = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const take = 20;
  let itens: { id: string; nome: string; detalhe?: string }[] = [];
  if (objeto === "deal") {
    const l = await prisma.deal.findMany({
      where: { orgId: ctx.orgId, ...(contem ? { name: contem } : {}) },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, name: true, stage: { select: { name: true } } },
    });
    itens = l.map((x) => ({ id: x.id, nome: x.name, detalhe: x.stage?.name }));
  } else if (objeto === "contact") {
    const l = await prisma.contact.findMany({
      where: { orgId: ctx.orgId, ...(contem ? { OR: [{ name: contem }, { email: contem }, { phone: contem }] } : {}) },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, name: true, email: true, phone: true },
    });
    itens = l.map((x) => ({ id: x.id, nome: x.name || x.email || x.phone || "Sem nome", detalhe: x.email || x.phone || undefined }));
  } else if (objeto === "company") {
    const l = await prisma.company.findMany({
      where: { orgId: ctx.orgId, ...(contem ? { name: contem } : {}) },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, name: true, cnpj: true },
    });
    itens = l.map((x) => ({ id: x.id, nome: x.name, detalhe: x.cnpj || undefined }));
  } else if (objeto === "task") {
    const l = await prisma.task.findMany({
      where: { orgId: ctx.orgId, ...(contem ? { text: contem } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, text: true, doneAt: true },
    });
    itens = l.map((x) => ({ id: x.id, nome: x.text, detalhe: x.doneAt ? "concluída" : "aberta" }));
  } else if (objeto === "conversation") {
    const l = await prisma.conversation.findMany({
      where: {
        agent: { orgId: ctx.orgId },
        channel: { notIn: ["playground", "builder_preview"] },
        ...(contem ? { OR: [{ contactId: contem }, { contact: { name: contem } }] } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      take,
      select: { id: true, channel: true, contactId: true, contact: { select: { name: true } } },
    });
    itens = l.map((x) => ({ id: x.id, nome: x.contact?.name || x.contactId, detalhe: x.channel }));
  } else return NextResponse.json({ error: "Tipo de registro inválido." }, { status: 400 });
  return NextResponse.json({ itens });
}
