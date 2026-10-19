// Tipos e rótulos da tela de Contatos (lista, ficha, etiquetas e segmentos).

export interface ContactTag {
  id: string;
  name: string;
  color: string;
}

export interface ContactChannelRow {
  id: string;
  agentId: string;
  channel: string;
  externalId: string;
}

export interface Contact {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  /** Secundários: [{ value, label }]. */
  phones?: unknown;
  notes: string;
  customFields: Record<string, unknown>;
  source: string;
  optIn: boolean;
  company: { id: string; name: string } | null;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  lastSeenAt: string;
  createdAt: string;
  tags: ContactTag[];
  channels: ContactChannelRow[];
}

export interface TagRow extends ContactTag {
  contactCount: number;
}

export interface SegmentRule {
  field: string;
  op: string;
  value?: string;
}

export interface SegmentRow {
  id: string;
  name: string;
  match: string;
  rules: SegmentRule[];
  contactCount: number;
}

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_qr: "WhatsApp (QR)",
  whatsapp_meta: "WhatsApp (oficial)",
  instagram: "Instagram",
  telegram: "Telegram",
  messenger: "Messenger",
  tiktok: "TikTok",
  website: "Site",
  playground: "Playground",
};

export const SOURCE_LABEL: Record<string, string> = {
  conversa: "Conversa",
  importacao: "Importação",
  api: "API",
  manual: "Manual",
};

// Campos que o construtor de regra de segmento oferece. Campo livre
// ("custom:") é digitado, porque cada agente captura uma coisa diferente.
export const RULE_FIELDS = [
  { value: "name", label: "Nome", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "email", label: "E-mail", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "phone", label: "Telefone", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "channel", label: "Canal", ops: ["equals", "not_equals"] },
  { value: "source", label: "Origem", ops: ["equals", "not_equals"] },
  { value: "optIn", label: "Opt-in", ops: ["is_true", "is_false"] },
  { value: "tag", label: "Etiqueta", ops: ["has", "not_has"] },
  { value: "createdAt", label: "Criado em", ops: ["before", "after"] },
  { value: "lastSeenAt", label: "Visto por último", ops: ["before", "after"] },
  { value: "custom", label: "Campo livre", ops: ["contains", "equals", "not_equals", "is_empty", "not_empty"] },
];

export const OP_LABEL: Record<string, string> = {
  contains: "contém",
  equals: "é igual a",
  not_equals: "é diferente de",
  is_empty: "está vazio",
  not_empty: "está preenchido",
  has: "tem",
  not_has: "não tem",
  before: "antes de",
  after: "depois de",
  is_true: "é sim",
  is_false: "é não",
};

export const OPS_WITHOUT_VALUE = new Set(["is_empty", "not_empty", "is_true", "is_false"]);

/** Nome que aparece para o contato (nome, senão e-mail, senão telefone). */
export function nomeDoContato(c: Pick<Contact, "name" | "email" | "phone">): string {
  return c.name || c.email || c.phone || "Sem nome";
}
