import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// O cliente por trás da conversa: ficha, negócios e tarefas. É o painel da
// direita na caixa de entrada — o que faz atendimento e CRM serem a mesma
// tela, em vez de duas que o atendente alterna.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversa = await prisma.conversation.findFirst({
    where: { id, agent: { orgId: ctx.orgId } },
    select: { contactRecordId: true, variables: true },
  });
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  // Conversa sem ficha: Playground, ou conversa antiga que ainda não rodou
  // depois da ficha existir. A tela explica; não é erro.
  if (!conversa.contactRecordId) {
    return NextResponse.json({ contato: null, negocios: [], tarefas: [], variaveis: conversa.variables });
  }

  const contactId = conversa.contactRecordId;

  const [contato, negocios, tarefas] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, orgId: ctx.orgId },
      include: {
        company: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.dealContact.findMany({
      where: { contactId, deal: { archivedAt: null } },
      include: {
        deal: {
          include: {
            stage: { select: { id: true, name: true, type: true } },
            pipeline: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { deal: { updatedAt: "desc" } },
      take: 10,
    }),
    prisma.task.findMany({
      where: { contactId, doneAt: null },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 10,
    }),
  ]);

  if (!contato) {
    return NextResponse.json({ contato: null, negocios: [], tarefas: [], variaveis: conversa.variables });
  }

  return NextResponse.json({
    contato: {
      id: contato.id,
      name: contato.name,
      email: contato.email,
      phone: contato.phone,
      jobTitle: contato.jobTitle,
      source: contato.source,
      optIn: contato.optIn,
      customFields: contato.customFields,
      company: contato.company,
      tags: contato.tags.map((t) => t.tag),
    },
    negocios: negocios.map(({ deal }) => ({
      id: deal.id,
      name: deal.name,
      amountCents: deal.amountCents,
      probability: deal.probability,
      stage: deal.stage,
      pipeline: deal.pipeline,
      closedAt: deal.closedAt?.toISOString() ?? null,
    })),
    tarefas: tarefas.map((t) => ({
      id: t.id,
      text: t.text,
      dueAt: t.dueAt?.toISOString() ?? null,
      atrasada: !!t.dueAt && t.dueAt.getTime() < Date.now(),
    })),
    variaveis: conversa.variables,
  });
}
