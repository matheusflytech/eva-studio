import { deSaoPaulo } from "@/lib/fuso-sp";
import { diaDaSemana, diaEmSP, noDia, somarDias, type Dia } from "./calendario";
import {
  RESULTADOS,
  ROTULO_DO_RESULTADO,
  normalizarTipoDeTarefa,
  rotuloDoTipo,
  tipoParaExibir,
  type ResultadoDaTarefa,
  type TipoDeTarefa,
} from "./tipos";

// ---------------------------------------------------------------------------
// Fluxo de conclusão (a maior alavanca de qualidade de dados, skill
// crm-tasks-agenda): resultado (falou / não atendeu / remarcou / outro) +
// nota opcional + "Agendar próxima atividade?" OBRIGATÓRIO — ou agenda (já
// vem sugerido) ou escolhe "Sem próximo passo". A escolha fica registrada.
// ---------------------------------------------------------------------------

export interface ProximaAtividade {
  tipo: TipoDeTarefa;
  texto: string;
  dueAt: Date;
  diaTodo: boolean;
}

export type ProximoPasso = { decisao: "agendou"; tarefa: ProximaAtividade } | { decisao: "sem_proximo" };

export interface PedidoDeConclusao {
  resultado: ResultadoDaTarefa;
  nota: string;
  proximo: ProximoPasso;
}

export type ValidacaoDaConclusao =
  | { ok: true; pedido: PedidoDeConclusao }
  | { ok: false; codigo: "resultado_obrigatorio" | "proximo_passo_obrigatorio" | "proxima_atividade_invalida"; erro: string };

/**
 * Corpo do POST /api/tasks/[id]/concluir:
 *   { resultado, nota?, proximo: { decisao: "sem_proximo" }
 *                              | { decisao: "agendou", tipo, texto, dueAt (ISO ou "AAAA-MM-DDTHH:mm" de SP), diaTodo? } }
 */
export function validarConclusao(corpo: unknown): ValidacaoDaConclusao {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const resultado = c.resultado;
  if (typeof resultado !== "string" || !(RESULTADOS as readonly string[]).includes(resultado)) {
    return { ok: false, codigo: "resultado_obrigatorio", erro: "Escolha o resultado: falou, não atendeu, remarcou ou outro." };
  }
  const nota = typeof c.nota === "string" ? c.nota.trim().slice(0, 5000) : "";
  const p = (c.proximo && typeof c.proximo === "object" ? c.proximo : null) as Record<string, unknown> | null;
  if (!p || (p.decisao !== "agendou" && p.decisao !== "sem_proximo")) {
    return { ok: false, codigo: "proximo_passo_obrigatorio", erro: "Agende a próxima atividade ou escolha “Sem próximo passo”." };
  }
  if (p.decisao === "sem_proximo") return { ok: true, pedido: { resultado: resultado as ResultadoDaTarefa, nota, proximo: { decisao: "sem_proximo" } } };

  const tipo = normalizarTipoDeTarefa(p.tipo ?? "afazer");
  const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 5000) : "";
  const dueAt = lerInstante(p.dueAt);
  if (!tipo || !texto || !dueAt) {
    return { ok: false, codigo: "proxima_atividade_invalida", erro: "A próxima atividade precisa de tipo, descrição e data." };
  }
  return {
    ok: true,
    pedido: {
      resultado: resultado as ResultadoDaTarefa,
      nota,
      proximo: { decisao: "agendou", tarefa: { tipo, texto, dueAt, diaTodo: p.diaTodo === true } },
    },
  };
}

/** ISO com fuso, ou "AAAA-MM-DDTHH:mm" lido em SP. */
export function lerInstante(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v.trim())) return deSaoPaulo(v.trim());
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Próximo dia útil (seg–sex) depois de `n` dias úteis. Feriados ficam para o item 13. */
export function somarDiasUteis(d: Dia, n: number): Dia {
  let atual = d;
  let faltam = n;
  while (faltam > 0) {
    atual = somarDias(atual, 1);
    const dow = diaDaSemana(atual);
    if (dow !== 0 && dow !== 6) faltam--;
  }
  return atual;
}

export const HORA_DA_SUGESTAO = 10;

/**
 * Próxima atividade sugerida (o formulário já vem preenchido):
 * - não atendeu → mesmo canal no próximo dia útil (ligação vira WhatsApp: quem
 *   não atende ligação costuma responder mensagem);
 * - remarcou → mesmo tipo em 2 dias úteis;
 * - falou → retorno por WhatsApp em 2 dias úteis;
 * - outro → mesmo tipo no próximo dia útil.
 * Sempre às 10h de SP.
 */
export function sugerirProximoPasso(
  tarefa: { tipo: string; texto: string },
  resultado: ResultadoDaTarefa,
  agora: Date
): ProximaAtividade {
  const tipo = tipoParaExibir(tarefa.tipo);
  const hoje = diaEmSP(agora);
  const base = tarefa.texto.trim();
  let novoTipo: TipoDeTarefa = tipo;
  let dias = 1;
  let texto = base;
  if (resultado === "nao_atendeu") {
    novoTipo = tipo === "ligar" ? "whatsapp" : tipo;
    texto = `Tentar de novo: ${base}`;
  } else if (resultado === "remarcou") {
    dias = 2;
  } else if (resultado === "falou") {
    novoTipo = "whatsapp";
    dias = 2;
    texto = `Retorno: ${base}`;
  }
  return { tipo: novoTipo, texto, dueAt: noDia(somarDiasUteis(hoje, dias), HORA_DA_SUGESTAO), diaTodo: false };
}

/** Linha da timeline: "Ligação · Não atendeu — caiu na caixa postal". */
export function textoDoResultado(tipo: string, resultado: string | null | undefined, nota?: string | null): string {
  const r = resultado && resultado in ROTULO_DO_RESULTADO ? ROTULO_DO_RESULTADO[resultado as ResultadoDaTarefa] : null;
  const partes = [rotuloDoTipo(tipo), r].filter(Boolean).join(" · ");
  return nota?.trim() ? `${partes} — ${nota.trim()}` : partes;
}

/**
 * Prazo vindo da tela: ISO com fuso, "AAAA-MM-DDTHH:mm" (lido em SP) ou
 * "AAAA-MM-DD" (dia todo: gravado às 23:59 de SP). undefined = não veio;
 * null = sem prazo; "invalida" = erro.
 */
export function lerPrazoDaTela(v: unknown): { dueAt: Date | null; diaTodo: boolean } | undefined | "invalida" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return { dueAt: null, diaTodo: false };
  if (typeof v !== "string") return "invalida";
  const s = v.trim();
  const soDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (soDia) {
    const d = deSaoPaulo(`${s}T23:59`);
    return d ? { dueAt: d, diaTodo: true } : "invalida";
  }
  const d = lerInstante(s);
  return d ? { dueAt: d, diaTodo: false } : "invalida";
}
