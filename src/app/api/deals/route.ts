import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeCrm, createDeal, ensureDefaultPipeline, resolverEtapaDeEntrada } from "@/lib/server/crm";
import { aplicarValores, carregarDefinicoes } from "@/lib/server/custom-fields";
import {
  JSON_INVALIDO,
  dataOpcional,
  erro,
  lerCorpo,
  reaisParaCentavos,
  respostaDeErroDoPrisma,
  texto,
} from "@/lib/server/api-validacao";

// Negócios de um funil, agrupados por etapa (o kanban lê isso direto).
//   ?pipeline=<id>  padrão: o funil padrão da org
//   ?archived=1     inclui arquivados
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const requested = url.searchParams.get("pipeline")?.trim() ?? "";
  const includeArchived = url.searchParams.get("archived") === "1";

  const pipeline = requested
    ? await prisma.pipeline.findFirst({
        where: { id: requested, orgId: ctx.orgId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : await ensureDefaultPipeline(ctx.orgId);

  if (!pipeline) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const deals = await prisma.deal.findMany({
    where: {
      orgId: ctx.orgId,
      pipelineId: pipeline.id,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: {
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              // Conversa de WhatsApp mais recente: o cartão mostra o atalho e
              // se há mensagem do cliente ainda não lida.
              conversations: {
                where: { channel: { in: ["whatsapp_meta", "whatsapp_qr"] } },
                orderBy: { lastContactMessageAt: "desc" },
                take: 1,
                select: { id: true, readAt: true, lastContactMessageAt: true },
              },
            },
          },
        },
      },
      // Próxima tarefa em aberto (a de prazo mais próximo; sem prazo fica por último).
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { type: true, text: true, dueAt: true } },
      // Só tarefas em aberto: o número no cartão é "o que falta fazer".
      _count: { select: { tasks: { where: { doneAt: null } } } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  // Total ponderado por etapa: é o número que a pessoa olha para saber se o
  // mês fecha. Valor bruto sozinho engana, porque trata "Novo" como se
  // valesse o mesmo que "Negociação".
  const stages = pipeline.stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    return {
      id: stage.id,
      name: stage.name,
      type: stage.type,
      color: stage.color,
      probability: stage.probability,
      totalCents: stageDeals.reduce((sum, d) => sum + d.amountCents, 0),
      weightedCents: stageDeals.reduce((sum, d) => sum + Math.round((d.amountCents * d.probability) / 100), 0),
      deals: stageDeals.map((d) => ({
        id: d.id,
        name: d.name,
        amountCents: d.amountCents,
        currency: d.currency,
        probability: d.probability,
        company: d.company,
        owner: d.owner,
        contacts: d.contacts.map((c) => ({ id: c.contact.id, name: c.contact.name })),
        whatsapp: (() => {
          const conversa = d.contacts.map((c) => c.contact.conversations[0]).find(Boolean);
          if (!conversa) return null;
          const naoLida =
            !!conversa.lastContactMessageAt && (!conversa.readAt || conversa.lastContactMessageAt > conversa.readAt);
          return { conversationId: conversa.id, naoLida };
        })(),
        nextTask: d.tasks[0]
          ? { type: d.tasks[0].type, text: d.tasks[0].text, dueAt: d.tasks[0].dueAt?.toISOString() ?? null }
          : null,
        openTasks: d._count.tasks,
        customFields: (d.customFields ?? {}) as Record<string, unknown>,
        expectedClosingAt: d.expectedClosingAt?.toISOString() ?? null,
        closedAt: d.closedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        stageSince: d.stageSince.toISOString(),
      })),
    };
  });

  // Definições dos campos: o kanban mostra como etiqueta os marcados "no cartão".
  const fields = await carregarDefinicoes(ctx.orgId, "deal", pipeline.id);

  return NextResponse.json({
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
    fields,
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const name = texto(body.name, 200) ?? "";
  if (!name) return erro("Nome do negócio é obrigatório.");

  const amountCents = reaisParaCentavos(body.amount);
  if (amountCents === null) return erro("Valor inválido (máximo R$ 21 milhões).");
  const expectedClosingAt = dataOpcional(body.expectedClosingAt);
  if (expectedClosingAt === "invalida") return erro("Previsão de fechamento inválida.");
  for (const campo of ["pipelineId", "stageId"] as const) {
    if (body[campo] !== undefined && body[campo] !== null && typeof body[campo] !== "string") {
      return erro(`${campo === "stageId" ? "Etapa" : "Funil"} inválido.`);
    }
  }

  try {
    // Etapa primeiro: é dela que sai o funil, e os campos personalizados são
    // validados contra o funil onde o negócio vai de fato morar.
    const stage = await resolverEtapaDeEntrada(
      ctx.orgId,
      (body.pipelineId as string) || undefined,
      (body.stageId as string) || undefined
    );

    // Campos personalizados: da tela, são validados de verdade (obrigatório,
    // tipo). O motor do fluxo usa createDeal direto e é mais tolerante.
    let customFields: Record<string, unknown> | undefined;
    if (body.customFields && typeof body.customFields === "object") {
      const defs = await carregarDefinicoes(ctx.orgId, "deal", stage.pipelineId);
      const r = aplicarValores(defs, {}, body.customFields as Record<string, unknown>, { exigirObrigatorios: true });
      if (!r.ok) return NextResponse.json({ error: r.erros.join(" "), erros: r.erros }, { status: 400 });
      customFields = r.valores;
    }

    const deal = await createDeal({
      orgId: ctx.orgId,
      name,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      contactId: (body.contactId as string) || null,
      companyId: (body.companyId as string) || null,
      ownerId: (body.ownerId as string) || ctx.userId,
      amountCents: amountCents ?? 0,
      description: texto(body.description, 5000) ?? "",
      expectedClosingAt: expectedClosingAt ?? null,
      customFields,
    });

    return NextResponse.json({ deal: { id: deal.id, name: deal.name } });
  } catch (e) {
    if (e instanceof ErroDeCrm) return erro(e.message, e.status);
    return respostaDeErroDoPrisma(e);
  }
}
