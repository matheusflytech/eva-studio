import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
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
import { lerLayoutDoFunil } from "@/lib/server/layout-do-cartao";
import { lerRegras } from "@/lib/server/regras-de-etapa";
import { resolverConjunto, whereDeNegocios } from "@/lib/server/filtro-crm";
import {
  INCLUDE_CARTAO,
  ORDEM_DA_COLUNA,
  comAtividade,
  comProdutos,
  decodificarCursor,
  lerPorEtapa,
  paginaDaColuna,
  serializarCartao,
  totaisPorEtapa,
  type Cartao,
} from "@/lib/server/quadro-negocios";

// Negócios de um funil, agrupados por etapa (o kanban lê isso direto).
//   ?pipeline=<id>  padrão: o funil padrão da org
//   ?archived=1     inclui arquivados
//   ?filtro=<JSON>  filtro das listas (src/lib/filtro-crm.ts), somado ao escopo
//
// Dois modos (decisão da Fase L1, para a tela atual não quebrar):
//   - SEM ?porEtapa: o contrato de sempre — todos os cartões do funil. Cada
//     etapa ganha `count` e `temMais: false` (aditivos).
//   - COM ?porEtapa=N (1..100; inválido = 30): por etapa { count, totalCents,
//     weightedCents } agregados no banco + os N primeiros cartões na ordem
//     (position, id), `temMais` e `depois` (cursor do último entregue).
//   - ?etapa=<id>&depois=<cursor>[&porEtapa=N][&filtro=...]: mais cartões
//     daquela etapa, a partir do cursor — não repete nem pula.
export async function GET(request: Request) {
  const ctx = await requirePermission("negocios:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const requested = url.searchParams.get("pipeline")?.trim() ?? "";
  const includeArchived = url.searchParams.get("archived") === "1";
  const filtroBruto = url.searchParams.get("filtro");
  const porEtapaBruto = url.searchParams.get("porEtapa");
  const etapa = url.searchParams.get("etapa")?.trim() ?? "";

  // Filtro + escopo + funil num conjunto exato (com a parte em memória resolvida).
  const conjunto = async (pipelineId: string) => {
    const w = await whereDeNegocios(ctx, filtroBruto ?? "", {
      extras: [{ campo: "funil", op: "qualquer", valores: [pipelineId] }],
      incluirArquivados: includeArchived,
    });
    const r = await resolverConjunto(w, { orderBy: ORDEM_DA_COLUNA });
    return { where: r.where, avisos: w.avisos, truncado: r.truncado };
  };

  const mostraProdutos = (layout: { campos: string[]; previa: string[] }) =>
    layout.campos.includes("produtos") || layout.previa.includes("produtos");

  // "Carregar mais" de uma coluna.
  if (etapa) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: etapa, pipeline: { orgId: ctx.orgId } },
      select: { id: true, pipelineId: true },
    });
    if (!stage) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });
    const depoisBruto = url.searchParams.get("depois")?.trim() ?? "";
    const cursor = depoisBruto ? decodificarCursor(depoisBruto) : null;
    if (depoisBruto && !cursor) return erro("Cursor inválido.");
    const c = await conjunto(stage.pipelineId);
    const pagina = await paginaDaColuna(c.where, stage.id, lerPorEtapa(porEtapaBruto), cursor);
    const fields = await carregarDefinicoes(ctx.orgId, "deal", stage.pipelineId);
    const { layout } = await lerLayoutDoFunil(stage.pipelineId, fields, ctx.userId);
    let deals: Cartao[] = await comAtividade(pagina.linhas.map(serializarCartao));
    if (mostraProdutos(layout)) deals = await comProdutos(ctx.orgId, deals);
    return NextResponse.json({ etapa: stage.id, deals, temMais: pagina.temMais, depois: pagina.depois, avisos: c.avisos, truncado: c.truncado });
  }

  const pipeline = requested
    ? await prisma.pipeline.findFirst({
        where: { id: requested, orgId: ctx.orgId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : await ensureDefaultPipeline(ctx.orgId);

  if (!pipeline) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  // Definições dos campos: o kanban mostra como etiqueta os marcados "no cartão".
  const fields = await carregarDefinicoes(ctx.orgId, "deal", pipeline.id);
  // Layout do cartão junto, para o quadro não esperar uma segunda chamada.
  // Sem a tabela no banco, vem o padrão (lerLayoutDoFunil nunca lança).
  const { layout } = await lerLayoutDoFunil(pipeline.id, fields, ctx.userId);
  // Regras das etapas (prazo de parado e orientação). Sem a tabela: o padrão.
  const { regras } = await lerRegras(pipeline.stages);
  const etapaBase = (stage: (typeof pipeline.stages)[number]) => ({
    id: stage.id,
    name: stage.name,
    type: stage.type,
    color: stage.color,
    probability: stage.probability,
    rottingDays: regras.get(stage.id)?.diasParado ?? null,
    guidance: regras.get(stage.id)?.orientacao ?? "",
  });

  if (porEtapaBruto !== null) {
    const n = lerPorEtapa(porEtapaBruto);
    const c = await conjunto(pipeline.id);
    const [totais, paginas] = await Promise.all([
      totaisPorEtapa(c.where),
      Promise.all(pipeline.stages.map((s) => paginaDaColuna(c.where, s.id, n))),
    ]);
    let cartoes: Cartao[][] = paginas.map((p) => p.linhas.map(serializarCartao));
    {
      const todos = await comAtividade(cartoes.flat());
      const porId = new Map(todos.map((d) => [d.id, d]));
      cartoes = cartoes.map((l) => l.map((d) => porId.get(d.id) ?? d));
    }
    if (mostraProdutos(layout)) {
      const todos = await comProdutos(ctx.orgId, cartoes.flat());
      const porId = new Map(todos.map((d) => [d.id, d]));
      cartoes = cartoes.map((l) => l.map((d) => porId.get(d.id) ?? d));
    }
    return NextResponse.json({
      pipeline: { id: pipeline.id, name: pipeline.name },
      porEtapa: n,
      stages: pipeline.stages.map((stage, i) => ({
        ...etapaBase(stage),
        ...(totais.get(stage.id) ?? { count: 0, totalCents: 0, weightedCents: 0 }),
        deals: cartoes[i],
        temMais: paginas[i].temMais,
        depois: paginas[i].depois,
      })),
      fields,
      layout,
      avisos: c.avisos,
      truncado: c.truncado,
    });
  }

  // Modo de sempre: todos os cartões do funil.
  const c = filtroBruto ? await conjunto(pipeline.id) : null;
  const deals = await prisma.deal.findMany({
    where: {
      orgId: ctx.orgId,
      pipelineId: pipeline.id,
      // "Só os meus" / "da minha equipe" do papel (vazio = todos).
      ...(await filtroDeEscopo(ctx, "negocios")),
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(c ? { AND: [c.where] } : {}),
    },
    include: INCLUDE_CARTAO,
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  // Total ponderado por etapa: é o número que a pessoa olha para saber se o
  // mês fecha. Valor bruto sozinho engana, porque trata "Novo" como se
  // valesse o mesmo que "Negociação".
  let cartoes: Cartao[] = await comAtividade(deals.map(serializarCartao));
  // Nomes dos produtos só quando o cartão ou a prévia mostram produtos (sem a
  // tabela no banco, nomesDosProdutosPorNegocio devolve vazio e nada quebra).
  if (mostraProdutos(layout)) cartoes = await comProdutos(ctx.orgId, cartoes);
  const stages = pipeline.stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    const ids = new Set(stageDeals.map((d) => d.id));
    return {
      ...etapaBase(stage),
      count: stageDeals.length,
      totalCents: stageDeals.reduce((sum, d) => sum + d.amountCents, 0),
      weightedCents: stageDeals.reduce((sum, d) => sum + Math.round((d.amountCents * d.probability) / 100), 0),
      deals: cartoes.filter((d) => ids.has(d.id)),
      temMais: false,
    };
  });

  return NextResponse.json({
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
    fields,
    layout,
    ...(c ? { avisos: c.avisos, truncado: c.truncado } : {}),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("negocios:criar");
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
