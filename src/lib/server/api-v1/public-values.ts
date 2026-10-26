// ---------------------------------------------------------------------------
// Valores fixos da API pública em inglês (docs/NAMING.md). O banco continua
// gravando os ids antigos em português; a tradução acontece só na borda:
// toda saída sai em inglês e a entrada aceita os dois (o antigo por um tempo).
// Sem `server-only`: os exemplos da documentação usam os mesmos mapas.
// ---------------------------------------------------------------------------

type Mapa = Readonly<Record<string, string>>;

/** Gravado → público. Valor fora do mapa sai como está (nunca some). */
export function toPublic(mapa: Mapa, valor: string): string;
export function toPublic(mapa: Mapa, valor: string | null): string | null;
export function toPublic(mapa: Mapa, valor: string | null): string | null {
  return valor === null ? null : (mapa[valor] ?? valor);
}

/** Público (ou o antigo) → gravado; undefined se não é nenhum dos dois. */
export function fromPublic(mapa: Mapa, valor: string): string | undefined {
  if (valor in mapa) return valor;
  return Object.keys(mapa).find((k) => mapa[k] === valor);
}

export const TASK_TYPE: Mapa = { ligar: "call", whatsapp: "whatsapp", email: "email", reuniao: "meeting", visita: "visit", afazer: "todo", outro: "todo" };

export const LEAD_STAGE: Mapa = { novo: "new", contatado: "contacted", qualificado: "qualified", ganho: "won", perdido: "lost" };

export const CONTACT_SOURCE: Mapa = { api: "api", importacao: "import", manual: "manual", conversa: "conversation", site: "website" };

export const STAGE_HISTORY_SOURCE: Mapa = {
  usuario: "user",
  fluxo: "flow",
  api: "api",
  importacao: "import",
  automacao: "automation",
  backfill: "backfill",
};

export const FLOW_VERSION_SOURCE: Mapa = { api: "api", restauracao: "restore" };

export const WEBHOOK_SOURCE: Mapa = { tela: "app", api: "api" };

/** Motivo de saída da sequência. Texto livre (falha de envio) vira send_failed + o texto em stopped_detail. */
export const ENROLLMENT_STOP_REASON: Mapa = { respondeu: "replied", "opt-out": "opted_out", manual: "manual", automacao: "automation", "automação": "automation" };

export function enrollmentStop(motivo: string | null): { stopped_reason: string | null; stopped_detail: string | null } {
  if (motivo === null) return { stopped_reason: null, stopped_detail: null };
  const codigo = ENROLLMENT_STOP_REASON[motivo];
  return codigo ? { stopped_reason: codigo, stopped_detail: null } : { stopped_reason: "send_failed", stopped_detail: motivo };
}

/** Campo obrigatório da etapa (details.missing_fields[].field). cf:<chave> → custom_fields.<chave>. */
export const STAGE_REQUIRED_FIELD: Mapa = {
  valor: "amount_cents",
  previsao: "expected_closing_at",
  responsavel: "owner_id",
  contato: "contact",
  empresa: "company_id",
  produtos: "products",
};
export const requiredFieldToPublic = (campo: string) => (campo.startsWith("cf:") ? `custom_fields.${campo.slice(3)}` : toPublic(STAGE_REQUIRED_FIELD, campo));

/** Motivos de perda padrão: padrao:preco ↔ default:price. */
export const DEFAULT_LOST_REASON: Mapa = {
  "padrao:preco": "default:price",
  "padrao:concorrente": "default:competitor",
  "padrao:sem-resposta": "default:no_response",
  "padrao:sem-orcamento": "default:no_budget",
  "padrao:timing": "default:timing",
  "padrao:outro": "default:other",
};
export const lostReasonIdToPublic = (id: string) => toPublic(DEFAULT_LOST_REASON, id);
/** Id que veio na API → id que o motor entende (padrão em inglês vira o antigo; id do banco passa). */
export const lostReasonIdFromPublic = (id: string) => fromPublic(DEFAULT_LOST_REASON, id) ?? id;
