// Tipos e pequenas funções compartilhadas pela caixa de entrada.

export interface Janela {
  restrita: boolean;
  aberta: boolean;
  expiraEm: string | null;
  minutosRestantes: number | null;
}

export interface Conversa {
  id: string;
  agentId: string;
  agentName: string;
  channel: string;
  contactId: string;
  nome: string;
  status: string;
  assignedTo: { id: string; name: string } | null;
  naoLidas: number;
  lastMessageAt: string;
  lastMessageText: string;
  lastMessageRole: string;
  janela: Janela;
  contato: { id: string; name: string; phone: string; email: string; empresa: string | null } | null;
  negocio: { id: string; name: string; etapa: string; valorCents: number } | null;
  respondivel: boolean;
  simulado: boolean;
}

export interface Midia {
  url: string;
  type: string;
  mime: string;
  name: string | null;
  size: number | null;
}

export interface Mensagem {
  id: string;
  role: "contact" | "bot" | "human" | "note" | string;
  text: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  media: Midia | null;
  entrega: { status: string; erro: string | null; atrasada: boolean } | null;
}

export interface Contexto {
  contato: {
    id: string;
    name: string;
    email: string;
    phone: string;
    jobTitle: string;
    source: string;
    optIn: boolean;
    customFields: Record<string, unknown>;
    company: { id: string; name: string } | null;
    tags: { id: string; name: string; color: string }[];
  } | null;
  negocios: {
    id: string;
    name: string;
    amountCents: number;
    probability: number;
    stage: { id: string; name: string; type: string };
    pipeline: { id: string; name: string };
    closedAt: string | null;
  }[];
  tarefas: { id: string; text: string; dueAt: string | null; atrasada: boolean }[];
}

export interface Membro {
  id: string;
  name: string;
  email: string;
  isMe: boolean;
}

export interface Resumo {
  esperando: number;
  minhas: number;
  naoLidas: number;
}

export const NOME_DO_CANAL: Record<string, string> = {
  whatsapp_meta: "WhatsApp",
  whatsapp_qr: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  website: "Site",
  playground: "Teste",
  builder_preview: "Teste",
};

export const FILTROS = [
  { id: "todas", rotulo: "Todas" },
  { id: "esperando", rotulo: "Esperando" },
  { id: "minhas", rotulo: "Minhas" },
  { id: "agente", rotulo: "Com o agente" },
  { id: "encerradas", rotulo: "Encerradas" },
] as const;

export type IdDoFiltro = (typeof FILTROS)[number]["id"];

export function iniciais(nome: string): string {
  // Só letras: telefone e identificador não viram "50" dentro de um círculo.
  // Quem chama mostra um ícone de pessoa quando volta vazio.
  const limpo = nome.replace(/[^\p{L}\s]/gu, " ").trim();
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const mesmaData = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Hora de hoje, "Ontem", ou a data. É o que cabe numa linha de lista. */
export function horaCurta(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  if (mesmaData(d, agora)) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (mesmaData(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  if (mesmaData(d, agora)) return "Hoje";
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (mesmaData(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: d.getFullYear() === agora.getFullYear() ? undefined : "numeric" });
}

export function horaDaMensagem(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function dinheiro(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "3h 20min" para a janela de 24h. */
export function tempoRestante(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h <= 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
