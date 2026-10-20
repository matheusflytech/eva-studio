import "server-only";
import { prisma } from "@/lib/db/prisma";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { lerLayoutDoFunil } from "@/lib/server/layout-do-cartao";
import { itensPorNegocio } from "@/lib/server/produtos";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { resolverConjunto, whereDeNegocios } from "@/lib/server/filtro-crm";
import type { Prisma } from "@/generated/prisma/client";
import type { EscoposDoPapel } from "@/lib/permissoes/catalogo";
import type { LayoutDoCartao } from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { filtrarEtapas, type EtapaKanban, type FiltrosDeNegocio, type VisaoSalva } from "@/components/crm/negocios/modelo";
import { LIMITE_DE_EXPORTACAO, type EtapaParaExportar, type NegocioParaExportar } from "@/lib/exportar/negocios";

// Busca o que a exportação do funil precisa (planilha e relatório). A org vem
// sempre da sessão: um id de funil de outra organização não acha nada.

export interface FiltrosDaExportacao {
  busca?: string;
  /** id do responsável; "__sem" = sem responsável. */
  dono?: string;
  visao?: VisaoSalva;
  arquivados?: boolean;
}

const VISOES: VisaoSalva[] = ["todos", "meus", "atencao", "parados", "fechando"];

/** Lê os filtros da URL, com os mesmos nomes da tela de Negócios. */
export function lerFiltrosDaUrl(p: URLSearchParams): FiltrosDaExportacao {
  const busca = p.get("busca")?.trim().slice(0, 120) || undefined;
  const dono = p.get("dono")?.trim().slice(0, 60) || undefined;
  const visao = VISOES.find((v) => v === p.get("visao"));
  const arquivados = p.get("arquivados") === "1" || p.get("archived") === "1";
  return { busca, dono, visao: visao && visao !== "todos" ? visao : undefined, arquivados };
}

export interface DadosDaExportacao {
  funil: { id: string; name: string };
  etapas: EtapaParaExportar[];
  negocios: NegocioParaExportar[];
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  /** Passou do limite: a lista veio cortada. */
  truncado: boolean;
}

/** null = funil não existe nesta organização. */
export async function carregarExportacao(
  ctx: { orgId: string; userId: string; escopo?: EscoposDoPapel },
  pipelineId: string | undefined,
  filtros: FiltrosDaExportacao,
  agora = new Date(),
  /**
   * itens: traz os itens (produtos) de cada negócio — a planilha usa, o relatório não.
   * filtro: o filtro do motor (o mesmo da tela: barra, avançados, visão, busca);
   * com ele, os filtros antigos (busca/dono/visão) são ignorados.
   * ids: só estes negócios (exportar a seleção), sempre dentro do contrato e do escopo.
   */
  opcoes: { itens?: boolean; filtro?: unknown; ids?: string[] } = {}
): Promise<DadosDaExportacao | null> {
  // Sem funil pedido: o padrão (ou o primeiro). Só leitura; exportar não cria funil.
  const pipeline = await prisma.pipeline.findFirst({
    where: pipelineId ? { id: pipelineId, orgId: ctx.orgId } : { orgId: ctx.orgId },
    include: { stages: { orderBy: { position: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
  if (!pipeline) return null;

  // Filtro novo (motor da tela) ou seleção: where exato do motor, preso ao
  // contrato, ao escopo e a este funil. Sem eles, o caminho antigo.
  const doMotor = opcoes.filtro !== undefined || (opcoes.ids?.length ?? 0) > 0;
  let where: Prisma.DealWhereInput;
  if (doMotor) {
    const w = await whereDeNegocios(ctx, opcoes.filtro ?? null, {
      agora,
      extras: [{ campo: "funil", op: "qualquer", valores: [pipeline.id] }],
      incluirArquivados: filtros.arquivados,
    });
    const r = await resolverConjunto(w);
    where = { AND: [r.where, { pipelineId: pipeline.id }, ...(opcoes.ids?.length ? [{ id: { in: opcoes.ids } }] : [])] };
  } else {
    where = {
      orgId: ctx.orgId,
      pipelineId: pipeline.id,
      ...(filtros.arquivados ? {} : { archivedAt: null }),
      // Exporta só o que o papel deixa ver ("só os meus" / "da equipe").
      ...(await filtroDeEscopo(ctx, "negocios")),
    };
  }

  const linhas = await prisma.deal.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: { include: { contact: { select: { id: true, name: true, phone: true, email: true } } } },
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { type: true, text: true, dueAt: true } },
      _count: { select: { tasks: { where: { doneAt: null } } } },
    },
    // Mesma ordem da planilha: se cortar no limite, corta o fim do funil.
    orderBy: [{ stage: { position: "asc" } }, { position: "asc" }, { createdAt: "desc" }],
    take: LIMITE_DE_EXPORTACAO + 1,
  });
  const truncado = linhas.length > LIMITE_DE_EXPORTACAO;

  const etapas: EtapaParaExportar[] = pipeline.stages.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    position: s.position,
    probability: s.probability,
  }));

  let negocios: NegocioParaExportar[] = linhas.slice(0, LIMITE_DE_EXPORTACAO).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    stageId: d.stageId,
    position: d.position,
    amountCents: d.amountCents,
    probability: d.probability,
    lostReason: d.lostReason ?? "",
    createdAt: d.createdAt,
    stageSince: d.stageSince,
    closedAt: d.closedAt,
    expectedClosingAt: d.expectedClosingAt,
    archivedAt: d.archivedAt,
    company: d.company,
    owner: d.owner,
    contacts: d.contacts.map((c) => ({
      id: c.contact.id,
      name: c.contact.name ?? "",
      phone: c.contact.phone ?? "",
      email: c.contact.email ?? "",
    })),
    nextTask: d.tasks[0] ? { type: d.tasks[0].type, text: d.tasks[0].text, dueAt: d.tasks[0].dueAt } : null,
    openTasks: d._count.tasks,
    customFields: (d.customFields ?? {}) as Record<string, unknown>,
  }));

  if (!doMotor && (filtros.busca || filtros.dono || filtros.visao)) {
    negocios = aplicarFiltrosDaTela(etapas, negocios, { ...filtros, meuId: ctx.userId }, agora);
  }

  if (opcoes.itens) {
    // Sem a tabela no banco, itensPorNegocio devolve vazio: a planilha sai sem produtos.
    const itens = await itensPorNegocio(ctx.orgId, negocios.map((n) => n.id));
    negocios = negocios.map((n) => (itens.has(n.id) ? { ...n, itens: itens.get(n.id) } : n));
  }

  const defs = await carregarDefinicoes(ctx.orgId, "deal", pipeline.id);
  const { layout } = await lerLayoutDoFunil(pipeline.id, defs);

  return { funil: { id: pipeline.id, name: pipeline.name }, etapas, negocios, defs, layout, truncado };
}

/**
 * Os filtros da tela, com a MESMA regra dela (filtrarEtapas): o que a pessoa
 * vê no quadro é o que sai no arquivo.
 */
export function aplicarFiltrosDaTela(
  etapas: EtapaParaExportar[],
  negocios: NegocioParaExportar[],
  filtros: FiltrosDeNegocio,
  agora: Date
): NegocioParaExportar[] {
  const iso = (d: Date | string | null) => (d === null ? null : d instanceof Date ? d.toISOString() : d);
  const quadro: EtapaKanban[] = etapas.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    color: "",
    probability: e.probability,
    totalCents: 0,
    weightedCents: 0,
    deals: negocios
      .filter((n) => n.stageId === e.id)
      .map((n) => ({
        id: n.id,
        name: n.name,
        amountCents: n.amountCents,
        probability: n.probability,
        company: n.company,
        owner: n.owner,
        contacts: n.contacts,
        openTasks: n.openTasks,
        expectedClosingAt: iso(n.expectedClosingAt),
        closedAt: iso(n.closedAt),
        customFields: n.customFields,
        createdAt: iso(n.createdAt)!,
        stageSince: iso(n.stageSince)!,
        whatsapp: null,
        nextTask: n.nextTask ? { type: n.nextTask.type, text: n.nextTask.text, dueAt: iso(n.nextTask.dueAt) } : null,
      })),
  }));
  const passaram = new Set(filtrarEtapas(quadro, filtros, agora).flatMap((e) => e.deals.map((d) => d.id)));
  return negocios.filter((n) => passaram.has(n.id));
}
