// ---------------------------------------------------------------------------
// Catálogo de eventos dos webhooks de saída (F6).
//
// Nome no formato `{objeto}.{ação}`, igual ao das outras APIs de CRM, para o
// n8n e quem integra reconhecerem de cara. A assinatura do endpoint aceita o
// nome exato, o curinga do objeto (`deal.*`) ou tudo (`*`).
//
// Sem `server-only`: a tela de webhooks usa a mesma lista.
// ---------------------------------------------------------------------------

export const EVENTOS = [
  { tipo: "contact.created", objeto: "contact", nome: "Contato criado" },
  { tipo: "contact.updated", objeto: "contact", nome: "Contato alterado" },
  { tipo: "lead.captured", objeto: "lead", nome: "Lead capturado" },
  { tipo: "deal.created", objeto: "deal", nome: "Negócio criado" },
  { tipo: "deal.stage_changed", objeto: "deal", nome: "Negócio mudou de etapa" },
  { tipo: "deal.won", objeto: "deal", nome: "Negócio ganho" },
  { tipo: "deal.lost", objeto: "deal", nome: "Negócio perdido" },
  { tipo: "deal.reopened", objeto: "deal", nome: "Negócio reaberto" },
  { tipo: "task.completed", objeto: "task", nome: "Tarefa concluída" },
  { tipo: "message.received", objeto: "message", nome: "Mensagem recebida" },
] as const;

export type TipoDeEvento = (typeof EVENTOS)[number]["tipo"] | "webhook.test";

export const OBJETOS_DOS_EVENTOS: Record<string, string> = {
  contact: "Contatos",
  lead: "Leads",
  deal: "Negócios",
  task: "Tarefas",
  message: "Mensagens",
};

const TIPOS = new Set<string>(EVENTOS.map((e) => e.tipo));
const OBJETOS = new Set<string>(EVENTOS.map((e) => e.objeto));

/** Filtro aceito na assinatura: "*", "deal.*" ou um tipo do catálogo. */
export function filtroDeEventoValido(f: string): boolean {
  if (f === "*") return true;
  if (f.endsWith(".*")) return OBJETOS.has(f.slice(0, -2));
  return TIPOS.has(f);
}

/** Lista limpa; null se tiver filtro desconhecido (erro de digitação não vira "nenhum evento"). */
export function normalizarFiltros(bruto: unknown): string[] | null {
  if (!Array.isArray(bruto)) return null;
  const lista = [...new Set(bruto.map((s) => String(s).trim()).filter(Boolean))];
  if (lista.length === 0 || !lista.every(filtroDeEventoValido)) return null;
  return lista.includes("*") ? ["*"] : lista.sort();
}

/** O endpoint assinou este evento? O teste chega sempre. */
export function assinaturaCobre(filtros: string[], tipo: string): boolean {
  if (tipo === "webhook.test") return true;
  const objeto = tipo.split(".")[0];
  return filtros.some((f) => f === "*" || f === tipo || f === `${objeto}.*`);
}

export function nomeDoEvento(tipo: string): string {
  if (tipo === "webhook.test") return "Teste";
  return EVENTOS.find((e) => e.tipo === tipo)?.nome ?? tipo;
}
