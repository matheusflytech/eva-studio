// Gatilhos do agente: palavra-chave na DM (qualquer canal), resposta/reação a
// story e menção em story (Instagram). Tudo aqui é puro — sem banco, sem
// rede — pra ser testado à parte e reaproveitado pelo motor e pela API.

export type TriggerKind = "dm_keyword" | "story_reply" | "story_mention";
export type MatchMode = "any" | "exact" | "contains";
export type InboundKind = "dm" | "story_reply" | "story_mention";

export const TRIGGER_KINDS: TriggerKind[] = ["dm_keyword", "story_reply", "story_mention"];
export const MATCH_MODES: MatchMode[] = ["any", "exact", "contains"];
export const TRIGGER_CHANNELS = ["instagram", "whatsapp_meta", "whatsapp_qr", "messenger", "telegram", "website", "tiktok"];
// Canais do simulador: testam o gatilho sem filtro de canal.
const TEST_CHANNELS = new Set(["builder_preview", "playground"]);
// Blocos em que a conversa pode ser "puxada" por uma palavra-chave. Captura
// fica de fora: a resposta do cliente ali é dado, não comando.
const INTERRUPTIBLE = new Set(["ai-agent", "agent", "wait"]);

export interface TriggerLike {
  id: string;
  kind: string;
  channels: string[];
  matchMode: string;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  priority: number;
  active: boolean;
  createdAt: Date;
}

export interface InboundContext {
  channel: string;
  kind: InboundKind;
  text?: string;
  storyId?: string;
  isReaction?: boolean;
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isEmojiOnly(text: string | undefined): boolean {
  const t = text?.trim();
  if (!t) return false;
  return t.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣\s]/gu, "").length === 0;
}

function keywordsMatch(mode: string, keywords: string[], text: string | undefined): boolean {
  if (mode === "any") return true;
  const t = normalizeText(text ?? "");
  if (!t) return false;
  const ks = keywords.map(normalizeText).filter(Boolean);
  if (mode === "exact") return ks.some((k) => t === k);
  if (mode === "contains") return ks.some((k) => t.includes(k));
  return false;
}

function specificity(t: TriggerLike): number {
  return (t.storyId ? 4 : 0) + (t.matchMode === "exact" ? 2 : t.matchMode === "contains" ? 1 : 0);
}

function best<T extends TriggerLike>(list: T[]): T | null {
  const sorted = [...list].sort(
    (a, b) =>
      specificity(b) - specificity(a) || b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime()
  );
  return sorted[0] ?? null;
}

function candidates<T extends TriggerLike>(triggers: T[], ctx: InboundContext, kind: TriggerKind): T[] {
  return triggers.filter((t) => {
    if (!t.active || t.kind !== kind) return false;
    if (t.channels.length > 0 && !TEST_CHANNELS.has(ctx.channel) && !t.channels.includes(ctx.channel)) return false;
    if (kind === "dm_keyword") return t.matchMode !== "any" && keywordsMatch(t.matchMode, t.keywords, ctx.text);
    if (kind === "story_reply") {
      if (t.storyId && t.storyId !== ctx.storyId) return false;
      if (ctx.isReaction && !t.includeReactions) return false;
      return keywordsMatch(t.matchMode, t.keywords, ctx.text);
    }
    return true; // story_mention: qualquer menção
  });
}

export function matchTrigger<T extends TriggerLike>(triggers: T[], ctx: InboundContext): T | null {
  if (ctx.kind === "story_mention") return best(candidates(triggers, ctx, "story_mention"));
  if (ctx.kind === "story_reply") {
    const story = best(candidates(triggers, ctx, "story_reply"));
    if (story) return story;
    // Um ❤️ num story não é pedido de nada — não pode cair numa palavra-chave de DM.
    if (ctx.isReaction) return null;
  }
  return best(candidates(triggers, ctx, "dm_keyword"));
}

export function podeAvaliarGatilho(parkedKind: string | null, inbound: InboundKind): boolean {
  if (inbound !== "dm") return true;
  return parkedKind === null || INTERRUPTIBLE.has(parkedKind);
}

export interface TriggerInput {
  name: string;
  kind: TriggerKind;
  channels: string[];
  matchMode: MatchMode;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  replyText: string;
  targetNodeId: string;
  priority: number;
  active: boolean;
}

// Limites do que um gatilho aceita. O texto da resposta segue o teto de uma
// mensagem do Instagram (1000), o canal mais restrito entre os atendidos.
export const TRIGGER_LIMITS = {
  name: 80,
  replyText: 1000,
  keyword: 60,
  keywords: 30,
  perAgent: 100,
} as const;

// Ids que vêm da Meta (story) e do Builder (bloco): só caracteres de id, nada
// que vire HTML, caminho ou consulta se um dia for parar noutro lugar.
const ID_PATTERN = /^[\w-]{1,64}$/;

/** Lê string sem aceitar objeto/array disfarçado (`{ $ne: 1 }` vira erro, não "[object Object]"). */
function readString(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function toList(value: unknown): string[] | null {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : value == null ? [] : null;
  if (!raw) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" && typeof v !== "number") return null;
    const s = String(v).trim();
    if (s) out.push(s);
  }
  return out;
}

/** Tira repetidas que o motor trataria como iguais (acento e caixa). Fica a primeira grafia. */
function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  return keywords.filter((k) => {
    const key = normalizeText(k);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseTriggerInput(body: unknown): { data: TriggerInput } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Dados do gatilho inválidos." };
  const b = body as Record<string, unknown>;

  const name = readString(b.name);
  if (name === null) return { error: "Nome inválido." };
  if (!name) return { error: "Dê um nome ao gatilho." };
  if (name.length > TRIGGER_LIMITS.name) return { error: `Nome muito longo (máximo de ${TRIGGER_LIMITS.name} caracteres).` };

  const kind = String(b.kind ?? "") as TriggerKind;
  if (!TRIGGER_KINDS.includes(kind)) return { error: "Tipo de gatilho inválido." };

  const isStory = kind !== "dm_keyword";
  const matchMode = (kind === "story_mention" ? "any" : String(b.matchMode ?? "contains")) as MatchMode;
  if (!MATCH_MODES.includes(matchMode)) return { error: "Modo de correspondência inválido." };
  if (kind === "dm_keyword" && matchMode === "any") {
    return { error: "Palavra-chave na DM precisa ser exata ou parcial — 'qualquer mensagem' já é o fluxo padrão." };
  }

  let keywords: string[] = [];
  if (matchMode !== "any") {
    const lista = toList(b.keywords);
    if (!lista) return { error: "Palavras-chave inválidas." };
    keywords = dedupeKeywords(lista);
    if (keywords.length === 0) return { error: "Informe ao menos uma palavra-chave." };
    if (keywords.length > TRIGGER_LIMITS.keywords) {
      return { error: `Use no máximo ${TRIGGER_LIMITS.keywords} palavras-chave por gatilho.` };
    }
    if (keywords.some((k) => k.length > TRIGGER_LIMITS.keyword)) {
      return { error: `Cada palavra-chave pode ter até ${TRIGGER_LIMITS.keyword} caracteres.` };
    }
  }

  const canais = toList(b.channels);
  if (!canais) return { error: "Canais inválidos." };
  const channels = isStory ? ["instagram"] : [...new Set(canais.filter((c) => TRIGGER_CHANNELS.includes(c)))];

  const replyText = readString(b.replyText);
  if (replyText === null) return { error: "Resposta inválida." };
  if (replyText.length > TRIGGER_LIMITS.replyText) {
    return { error: `Resposta muito longa (máximo de ${TRIGGER_LIMITS.replyText} caracteres).` };
  }

  const targetNodeId = readString(b.targetNodeId);
  if (targetNodeId === null || (targetNodeId && !ID_PATTERN.test(targetNodeId))) return { error: "Bloco de destino inválido." };
  if (!replyText && !targetNodeId) return { error: "Defina uma mensagem de resposta ou um bloco do fluxo para seguir." };

  const storyId = kind === "story_reply" ? readString(b.storyId) : "";
  if (storyId === null || (storyId && !ID_PATTERN.test(storyId))) return { error: "ID do story inválido." };

  const priority = Math.max(0, Math.min(100, Number.parseInt(String(b.priority ?? 0), 10) || 0));

  return {
    data: {
      name,
      kind,
      channels,
      matchMode,
      keywords,
      storyId,
      includeReactions: kind === "story_reply" ? b.includeReactions !== false : false,
      replyText,
      targetNodeId,
      priority,
      active: b.active !== false,
    },
  };
}
