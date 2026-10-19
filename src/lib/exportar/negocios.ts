// ---------------------------------------------------------------------------
// Exportação do funil de negócios: as linhas do CSV e os números do relatório.
//
// Puro (sem banco nem React): a rota busca, isto organiza. Uma linha por
// negócio, na ordem do funil (etapa, depois a posição no quadro), com todos os
// campos e um campo personalizado por coluna, com o rótulo que a pessoa deu.
// ---------------------------------------------------------------------------

import { formatarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { dataBR, dataHoraBR, diaSemFusoBR, montarCsv, reais, reaisCsv, type Celula } from "@/lib/exportar/csv";
import { rotuloDaRecorrencia, textoDaQuantidade, textoDoDesconto } from "@/lib/produtos";

/** Tetos da exportação: acima disso a planilha sai cortada e avisa. */
export const LIMITE_DE_EXPORTACAO = 20_000;

const DIA = 86_400_000;

type Data = Date | string;

export interface EtapaParaExportar {
  id: string;
  name: string;
  /** "open" | "won" | "lost" */
  type: string;
  position: number;
  probability: number;
}

export interface NegocioParaExportar {
  id: string;
  name: string;
  description: string;
  stageId: string;
  position: number;
  amountCents: number;
  probability: number;
  lostReason: string;
  createdAt: Data;
  stageSince: Data;
  closedAt: Data | null;
  expectedClosingAt: Data | null;
  archivedAt: Data | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  /** O primeiro é o contato principal. */
  contacts: { id: string; name: string; phone: string; email: string }[];
  nextTask: { type: string; text: string; dueAt: Data | null } | null;
  openTasks: number;
  customFields: Record<string, unknown>;
  /** Itens (produtos) do negócio, na ordem. Ausente = sem itens. */
  itens?: ItemParaExportar[];
}

export interface ItemParaExportar {
  name: string;
  sku: string;
  unit: string;
  recurrence: string;
  unitPriceCents: number;
  quantity: number;
  discountType: string;
  discountValue: number;
  totalCents: number;
}

/** "2 × Plano Pro; 1,5 × Implantação". */
export function resumoDosItensParaPlanilha(itens: ItemParaExportar[] | undefined): string {
  return (itens ?? []).map((i) => `${textoDaQuantidade(i.quantity)} × ${i.name}`).join("; ");
}

const SITUACAO: Record<string, string> = { open: "Em andamento", won: "Ganho", lost: "Perdido" };

export function situacaoDaEtapa(tipo: string): string {
  return SITUACAO[tipo] ?? "Em andamento";
}

const TIPO_DE_TAREFA: Record<string, string> = { ligar: "Ligar", email: "E-mail", reuniao: "Reunião" };

/** "Ligar: confirmar proposta". Tarefa do tipo "outro" fica só com o texto. */
export function descreverTarefa(t: NegocioParaExportar["nextTask"]): string {
  if (!t) return "";
  const tipo = TIPO_DE_TAREFA[t.type];
  const texto = t.text.trim();
  if (tipo && texto) return `${tipo}: ${texto}`;
  return tipo ?? texto;
}

const tempo = (d: Data) => (d instanceof Date ? d : new Date(d)).getTime();

/** Dias inteiros na etapa atual (0 = entrou hoje). */
export function diasNaEtapa(n: Pick<NegocioParaExportar, "stageSince">, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - tempo(n.stageSince)) / DIA));
}

export const ponderadoCents = (n: Pick<NegocioParaExportar, "amountCents" | "probability">) =>
  Math.round((n.amountCents * n.probability) / 100);

/**
 * Ordem do funil: etapa (pela posição dela), depois a posição do cartão na
 * coluna e, no empate, o mais novo primeiro (igual ao quadro). Negócio numa
 * etapa que não está na lista vai para o fim.
 */
export function ordenarPorEtapa<T extends Pick<NegocioParaExportar, "stageId" | "position" | "createdAt">>(
  etapas: EtapaParaExportar[],
  negocios: T[]
): T[] {
  const ordem = new Map([...etapas].sort((a, b) => a.position - b.position).map((e, i) => [e.id, i]));
  const fim = ordem.size;
  return [...negocios].sort(
    (a, b) =>
      (ordem.get(a.stageId) ?? fim) - (ordem.get(b.stageId) ?? fim) ||
      a.position - b.position ||
      tempo(b.createdAt) - tempo(a.createdAt)
  );
}

const COLUNAS_FIXAS = [
  "Funil",
  "Etapa",
  "Situação",
  "Negócio",
  "Empresa",
  "Contato principal",
  "Telefone",
  "E-mail",
  "Outros contatos",
  "Responsável",
  "Valor",
  "Valor (número)",
  "Chance %",
  "Valor ponderado",
  "Previsão de fechamento",
  "Criado em",
  "Na etapa desde",
  "Dias na etapa",
  "Fechado em",
  "Motivo de perda",
  "Próxima tarefa",
  "Prazo da próxima tarefa",
  "Tarefas abertas",
  "Descrição",
  "Produtos",
] as const;

export interface OpcoesDaPlanilha {
  funil: string;
  etapas: EtapaParaExportar[];
  negocios: NegocioParaExportar[];
  /** Campos personalizados de negócio que valem no funil, na ordem da tela. */
  defs: DefinicaoDeCampo[];
  agora: Date;
  /** Inclui a coluna "Arquivado em" (exportação com arquivados). */
  comArquivados?: boolean;
  /** Mensagem de aviso no fim (ex.: exportação cortada no limite). */
  aviso?: string | null;
}

export function cabecalhoDaPlanilha(defs: DefinicaoDeCampo[], comArquivados = false): string[] {
  return [...COLUNAS_FIXAS, ...(comArquivados ? ["Arquivado em"] : []), ...defs.map((d) => d.label)];
}

function outrosContatos(contatos: NegocioParaExportar["contacts"]): string {
  return contatos
    .slice(1)
    .map((c) => {
      const meios = [c.phone, c.email].filter(Boolean).join(", ");
      return meios ? `${c.name || "Sem nome"} (${meios})` : c.name || "Sem nome";
    })
    .join(" | ");
}

/** Cabeçalho + uma linha por negócio, já na ordem do funil. */
export function linhasDaPlanilha(o: OpcoesDaPlanilha): Celula[][] {
  const etapaPorId = new Map(o.etapas.map((e) => [e.id, e]));
  const linhas: Celula[][] = [cabecalhoDaPlanilha(o.defs, o.comArquivados)];
  for (const n of ordenarPorEtapa(o.etapas, o.negocios)) {
    const etapa = etapaPorId.get(n.stageId);
    const principal = n.contacts[0];
    linhas.push([
      o.funil,
      etapa?.name ?? "",
      situacaoDaEtapa(etapa?.type ?? "open"),
      n.name,
      n.company?.name ?? "",
      principal?.name ?? "",
      principal?.phone ?? "",
      principal?.email ?? "",
      outrosContatos(n.contacts),
      n.owner?.name ?? "",
      reais(n.amountCents),
      reaisCsv(n.amountCents),
      n.probability,
      reais(ponderadoCents(n)),
      diaSemFusoBR(n.expectedClosingAt),
      dataBR(n.createdAt),
      dataBR(n.stageSince),
      diasNaEtapa(n, o.agora),
      dataBR(n.closedAt),
      n.lostReason,
      descreverTarefa(n.nextTask),
      dataHoraBR(n.nextTask?.dueAt ?? null),
      n.openTasks,
      n.description,
      resumoDosItensParaPlanilha(n.itens),
      ...(o.comArquivados ? [dataBR(n.archivedAt)] : []),
      ...o.defs.map((d) => formatarValor(d, n.customFields?.[d.key])),
    ]);
  }
  if (o.aviso) linhas.push([], [o.aviso]);
  return linhas;
}

export function csvDosNegocios(o: OpcoesDaPlanilha): string {
  return montarCsv(linhasDaPlanilha(o));
}

const COLUNAS_DOS_ITENS = [
  "Funil",
  "Etapa",
  "Situação",
  "Negócio",
  "Empresa",
  "Responsável",
  "Produto",
  "Código",
  "Quantidade",
  "Unidade",
  "Preço unitário",
  "Desconto",
  "Total",
  "Total (número)",
  "Recorrência",
] as const;

/**
 * Planilha de itens: uma linha por item, com os dados do negócio repetidos
 * (é o formato que tabela dinâmica entende). Negócio sem itens não entra.
 */
export function linhasDosItens(o: OpcoesDaPlanilha): Celula[][] {
  const etapaPorId = new Map(o.etapas.map((e) => [e.id, e]));
  const linhas: Celula[][] = [[...COLUNAS_DOS_ITENS]];
  for (const n of ordenarPorEtapa(o.etapas, o.negocios)) {
    const etapa = etapaPorId.get(n.stageId);
    for (const i of n.itens ?? []) {
      linhas.push([
        o.funil,
        etapa?.name ?? "",
        situacaoDaEtapa(etapa?.type ?? "open"),
        n.name,
        n.company?.name ?? "",
        n.owner?.name ?? "",
        i.name,
        i.sku,
        textoDaQuantidade(i.quantity),
        i.unit,
        reais(i.unitPriceCents),
        textoDoDesconto(i.discountType, i.discountValue),
        reais(i.totalCents),
        reaisCsv(i.totalCents),
        rotuloDaRecorrencia(i.recurrence),
      ]);
    }
  }
  if (o.aviso) linhas.push([], [o.aviso]);
  return linhas;
}

export function csvDosItens(o: OpcoesDaPlanilha): string {
  return montarCsv(linhasDosItens(o));
}

// ── Números do relatório ───────────────────────────────────────────────────

export interface TotaisDaEtapa {
  etapaId: string;
  quantidade: number;
  totalCents: number;
  ponderadoCents: number;
}

export function totaisPorEtapa(etapas: EtapaParaExportar[], negocios: NegocioParaExportar[]): TotaisDaEtapa[] {
  return etapas.map((e) => {
    const daEtapa = negocios.filter((n) => n.stageId === e.id);
    return {
      etapaId: e.id,
      quantidade: daEtapa.length,
      totalCents: daEtapa.reduce((s, n) => s + n.amountCents, 0),
      ponderadoCents: daEtapa.reduce((s, n) => s + ponderadoCents(n), 0),
    };
  });
}

export interface ResumoDaExportacao {
  abertos: number;
  abertoCents: number;
  ponderadoCents: number;
  /** Ganhos com fechamento a partir de `desde`. */
  ganhos: number;
  ganhoCents: number;
}

export function resumoDaExportacao(
  etapas: EtapaParaExportar[],
  negocios: NegocioParaExportar[],
  desde: Date
): ResumoDaExportacao {
  const tipo = new Map(etapas.map((e) => [e.id, e.type]));
  const r: ResumoDaExportacao = { abertos: 0, abertoCents: 0, ponderadoCents: 0, ganhos: 0, ganhoCents: 0 };
  for (const n of negocios) {
    const t = tipo.get(n.stageId);
    if (t === "open") {
      r.abertos += 1;
      r.abertoCents += n.amountCents;
      r.ponderadoCents += ponderadoCents(n);
    } else if (t === "won" && n.closedAt && tempo(n.closedAt) >= desde.getTime()) {
      r.ganhos += 1;
      r.ganhoCents += n.amountCents;
    }
  }
  return r;
}
