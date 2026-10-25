import "server-only";
import { prisma } from "@/lib/db/prisma";
import { diaEmSP, noDia } from "@/lib/tarefas/calendario";

// ---------------------------------------------------------------------------
// Dados das telas de automação: a lista com os números do topo (no estilo da
// demo "Eva Automação": hoje, tempo médio, erros, ativas) e as opções dos
// seletores do editor (etapas, etiquetas, pessoas, agentes, modelos...).
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000;

export async function listarAutomacoes(orgId: string, agora = new Date()) {
  const inicioDoDia = noDia(diaEmSP(agora), 0, 0);
  const trintaDias = new Date(agora.getTime() - 30 * DIA_MS);
  const automacoes = await prisma.automacao.findMany({
    where: { orgId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { versaoPublicada: { select: { numero: true, createdAt: true } } },
  });
  const ids = automacoes.map((a) => a.id);
  const [porStatus, ultimas, hoje, mediaHoje] = await Promise.all([
    prisma.automacaoExecucao.groupBy({ by: ["automacaoId", "status"], where: { automacaoId: { in: ids }, teste: false, createdAt: { gte: trintaDias } }, _count: { _all: true } }),
    prisma.automacaoExecucao.groupBy({ by: ["automacaoId"], where: { automacaoId: { in: ids }, teste: false }, _max: { createdAt: true } }),
    prisma.automacaoExecucao.groupBy({ by: ["status"], where: { orgId, teste: false, createdAt: { gte: inicioDoDia } }, _count: { _all: true } }),
    prisma.automacaoExecucao.aggregate({ where: { orgId, teste: false, status: { in: ["concluida", "objetivo"] }, terminadaEm: { gte: inicioDoDia } }, _avg: { duracaoMs: true } }),
  ]);
  const contagem = (id: string, filtro?: (s: string) => boolean) =>
    porStatus.filter((x) => x.automacaoId === id && (!filtro || filtro(x.status))).reduce((s, x) => s + x._count._all, 0);
  const ultima = new Map(ultimas.map((u) => [u.automacaoId, u._max.createdAt]));

  return {
    kpis: {
      execucoesHoje: hoje.reduce((s, x) => s + x._count._all, 0),
      errosHoje: hoje.filter((x) => x.status === "falhou").reduce((s, x) => s + x._count._all, 0),
      tempoMedioMs: mediaHoje._avg.duracaoMs !== null ? Math.round(mediaHoje._avg.duracaoMs) : null,
      ativas: automacoes.filter((a) => a.status === "ativa").length,
    },
    automacoes: automacoes.map((a) => ({
      id: a.id,
      nome: a.nome,
      descricao: a.descricao,
      objeto: a.objeto,
      status: a.status,
      origem: a.origem,
      pausadaPor: a.pausadaPor,
      rascunho: a.rascunho,
      versao: a.versaoPublicada?.numero ?? null,
      publicadaEm: a.versaoPublicada?.createdAt.toISOString() ?? null,
      execucoes30d: contagem(a.id),
      erros30d: contagem(a.id, (s) => s === "falhou"),
      emAndamento: contagem(a.id, (s) => ["pendente", "rodando", "esperando"].includes(s)),
      ultimaExecucao: ultima.get(a.id)?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

/** Opções dos seletores do editor e os nomes da frase legível. */
export async function opcoesDoEditor(orgId: string) {
  const [funis, tags, membros, agentes, campos, modelosEmail, segmentos] = await Promise.all([
    prisma.pipeline.findMany({ where: { orgId }, orderBy: { position: "asc" }, include: { stages: { orderBy: { position: "asc" }, select: { id: true, name: true, type: true } } } }),
    prisma.tag.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.membership.findMany({ where: { orgId, status: "ativo" }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    prisma.agent.findMany({ where: { orgId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.customField.findMany({ where: { orgId }, select: { key: true, label: true, type: true, entity: true } }),
    prisma.emailModelo.findMany({ where: { orgId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }).catch(() => []),
    prisma.segment.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const agenteIds = agentes.map((a) => a.id);
  const [modelosWhatsapp, reguas] = await Promise.all([
    prisma.messageTemplate.findMany({ where: { agentId: { in: agenteIds }, metaTemplateName: { not: "" } }, select: { id: true, name: true, agentId: true } }),
    prisma.sequence.findMany({ where: { agentId: { in: agenteIds } }, select: { id: true, name: true, active: true } }),
  ]);
  return {
    funis: funis.map((f) => ({ id: f.id, nome: f.name, etapas: f.stages.map((s) => ({ id: s.id, nome: s.name, tipo: s.type })) })),
    tags: tags.map((t) => ({ id: t.id, nome: t.name })),
    usuarios: membros.map((m) => ({ id: m.userId, nome: m.user?.name || m.user?.email || "Sem nome" })),
    agentes: agentes.map((a) => ({ id: a.id, nome: a.name })),
    camposPersonalizados: campos.map((c) => ({ chave: c.key, nome: c.label, tipo: c.type, objeto: c.entity })),
    modelosWhatsapp: modelosWhatsapp.map((m) => ({ id: m.id, nome: m.name, agentId: m.agentId })),
    modelosEmail: modelosEmail.map((m) => ({ id: m.id, nome: m.nome })),
    reguas: reguas.map((r) => ({ id: r.id, nome: r.name, ativa: r.active })),
    segmentos: segmentos.map((s) => ({ id: s.id, nome: s.name })),
  };
}

export type OpcoesDoEditor = Awaited<ReturnType<typeof opcoesDoEditor>>;

export interface NumerosDoPasso {
  /** Execuções (não teste) que passaram por este bloco no período. */
  execucoes: number;
  /** Erro da última vez que o bloco rodou, se ela falhou. */
  ultimoErro: string | null;
  ultimaEm: string | null;
}

/**
 * Números de cada bloco no canvas (últimos 30 dias, sem execuções de teste):
 * quantas vezes rodou e o erro da última vez, se falhou. "gatilho" = total
 * de execuções que começaram.
 */
export async function numerosDosPassos(orgId: string, automacaoId: string, agora = new Date()): Promise<Record<string, NumerosDoPasso>> {
  const desde = new Date(agora.getTime() - 30 * DIA_MS);
  const [linhas, total] = await Promise.all([
    prisma.$queryRaw<{ noId: string; execucoes: number; ultimoStatus: string; ultimoErro: string | null; ultimaEm: Date }[]>`
      select p."noId" as "noId",
             count(distinct p."execucaoId")::int as execucoes,
             (array_agg(p.status order by p."iniciadoEm" desc))[1] as "ultimoStatus",
             (array_agg(p.erro order by p."iniciadoEm" desc))[1] as "ultimoErro",
             max(p."iniciadoEm") as "ultimaEm"
        from eva_studio_automacao_passos p
        join eva_studio_automacao_execucoes e on e.id = p."execucaoId"
       where e."automacaoId" = ${automacaoId} and e."orgId" = ${orgId}
         and e.teste = false and e."createdAt" >= ${desde}
       group by p."noId"`,
    prisma.automacaoExecucao.count({ where: { automacaoId, orgId, teste: false, createdAt: { gte: desde } } }),
  ]);
  const numeros: Record<string, NumerosDoPasso> = { gatilho: { execucoes: total, ultimoErro: null, ultimaEm: null } };
  for (const l of linhas) {
    numeros[l.noId] = {
      execucoes: l.execucoes,
      ultimoErro: l.ultimoStatus === "falhou" ? l.ultimoErro || "Falhou." : null,
      ultimaEm: l.ultimaEm ? new Date(l.ultimaEm).toISOString() : null,
    };
  }
  return numeros;
}
