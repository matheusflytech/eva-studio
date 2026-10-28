import { gatilhoDoTipo } from "./catalogo";
import type { Gatilho } from "./tipos";

// ---------------------------------------------------------------------------
// O evento casa com o gatilho da automação? Puro: o motor passa o evento do
// barramento e, quando o filtro precisa, a foto do registro (motivo da perda,
// tipo da tarefa). Os gatilhos de varredura (parado, data, agendado, sem
// resposta) não passam por aqui: o relógio procura quem atende.
// ---------------------------------------------------------------------------

export interface EventoParaCasar {
  tipo: string;
  objeto: string;
  objetoId: string;
  dados: Record<string, unknown>;
  diff?: Record<string, { de: unknown; para: unknown }>;
  ator?: { tipo: string; automacaoId?: string };
}

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const vazio = (v: unknown) => v === undefined || v === null || v === "";

/** Campo do diff a partir do caminho do contexto ("registro.amount_cents" → "amount_cents"). */
export function campoDoDiff(caminho: unknown): string {
  return String(caminho ?? "").replace(/^registro\./, "");
}

export function palavrasDoTexto(texto: unknown, palavras: unknown): boolean {
  const t = ` ${normal(texto).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return String(palavras ?? "")
    .split(",")
    .map((p) => normal(p).replace(/[^\p{L}\p{N}]+/gu, " ").trim())
    .filter(Boolean)
    .some((p) => t.includes(` ${p} `));
}

export function gatilhoCasa(
  gatilho: Gatilho,
  evento: EventoParaCasar,
  opcoes: { automacaoId: string; registro?: Record<string, unknown> | null }
): boolean {
  const item = gatilhoDoTipo(gatilho.tipo);
  if (!item || item.modo !== "evento" || !item.eventos.includes(evento.tipo) || item.objeto !== evento.objeto) return false;
  const c = gatilho.config ?? {};
  const d = evento.dados ?? {};
  const registro = opcoes.registro ?? {};
  const funilOk = vazio(c.funil) || d.pipeline_id === c.funil || registro.pipeline_id === c.funil;

  switch (gatilho.tipo) {
    case "deal.created":
    case "deal.won":
    case "deal.reopened":
    case "sale.approved":
    case "sale.refunded":
    case "sale.chargeback":
    case "sale.canceled":
      return funilOk;
    case "deal.lost":
      return funilOk && (vazio(c.motivo) || normal(registro.lost_reason).includes(normal(c.motivo)));
    case "deal.stage_entered": {
      const quando = (c.quando as string) ?? "ambos";
      if (d.to_stage_id !== c.etapa) return false;
      if (evento.tipo === "deal.created") return quando !== "movimento";
      return quando !== "criacao";
    }
    case "deal.stage_left":
      return d.from_stage_id === c.etapa;
    case "deal.field_changed":
    case "contact.field_changed":
    case "company.field_changed": {
      // A própria automação mudou o campo: não redispara (anti-loop do catálogo).
      if (evento.ator?.tipo === "automacao" && evento.ator.automacaoId === opcoes.automacaoId) return false;
      const mudou = evento.diff?.[campoDoDiff(c.campo)];
      if (!mudou) return false;
      if (vazio(c.para)) return true;
      return normal(mudou.para) === normal(c.para);
    }
    case "contact.tag_added":
    case "contact.tag_removed":
      return d.tag_id === c.tag;
    case "task.created":
    case "task.completed":
      return vazio(c.tipo_tarefa) || normal(registro.type ?? d.type) === normal(c.tipo_tarefa);
    case "message.received": {
      if (!vazio(c.canal) && d.channel !== c.canal) return false;
      const modo = (c.modo as string) ?? "primeira";
      if (modo === "primeira") return d.primeira === true;
      if (modo === "contem") return palavrasDoTexto(d.text, c.palavras);
      return true;
    }
    default:
      // Sem filtro próprio (contato criado, virou lead, empresa criada, responsável alterado).
      return true;
  }
}

/**
 * Registros que um evento "toca", para acordar quem está em "esperar evento":
 * a mensagem é da conversa e do contato; a tarefa, também do negócio e do
 * contato dela. Os negócios abertos do contato o motor acrescenta (precisa do banco).
 */
export function alvosDoEvento(evento: EventoParaCasar, registro?: Record<string, unknown> | null): { objeto: string; id: string }[] {
  const alvos = [{ objeto: evento.objeto, id: evento.objetoId }];
  const d = evento.dados ?? {};
  const add = (objeto: string, id: unknown) => {
    if (typeof id === "string" && id && !alvos.some((a) => a.objeto === objeto && a.id === id)) alvos.push({ objeto, id });
  };
  add("contact", d.contact_id);
  if (evento.objeto === "task" && registro) {
    add("deal", registro.deal_id);
    add("contact", registro.contact_id);
  }
  return alvos;
}
