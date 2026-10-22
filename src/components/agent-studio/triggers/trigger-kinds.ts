import { AtSign, CircleFadingPlus, MessageSquareText, type LucideIcon } from "lucide-react";

export type Kind = "dm_keyword" | "story_reply" | "story_mention";
export type Mode = "any" | "exact" | "contains";

export interface Trigger {
  id: string;
  name: string;
  kind: Kind;
  channels: string[];
  matchMode: Mode;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  replyText: string;
  targetNodeId: string;
  priority: number;
  active: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
}

export type Draft = Omit<Trigger, "id" | "triggerCount" | "lastTriggeredAt">;

export interface FlowNodeOption {
  id: string;
  label: string;
}

export interface StoryOption {
  id: string;
  preview: string;
  postedAt: string | null;
}

export const KINDS: Record<Kind, { label: string; short: string; description: string; icon: LucideIcon }> = {
  dm_keyword: {
    label: "Palavra-chave na mensagem",
    short: "Palavra-chave",
    description: "Alguém manda uma palavra no direct ou no WhatsApp e recebe a resposta certa.",
    icon: MessageSquareText,
  },
  story_reply: {
    label: "Resposta a story",
    short: "Resposta a story",
    description: "Alguém responde ou reage a um story seu no Instagram.",
    icon: CircleFadingPlus,
  },
  story_mention: {
    label: "Menção em story",
    short: "Menção em story",
    description: "Alguém marca sua conta num story. Ótimo para agradecer com um cupom.",
    icon: AtSign,
  },
};

export const CHANNELS: { id: string; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp_meta", label: "WhatsApp oficial" },
  { id: "whatsapp_qr", label: "WhatsApp (QR)" },
  { id: "messenger", label: "Messenger" },
  { id: "telegram", label: "Telegram" },
  { id: "website", label: "Site" },
  { id: "tiktok", label: "TikTok" },
];

export function emptyDraft(kind: Kind): Draft {
  return {
    name: "",
    kind,
    channels: [],
    matchMode: kind === "dm_keyword" ? "contains" : "any",
    keywords: [],
    storyId: "",
    includeReactions: true,
    replyText: "",
    targetNodeId: "",
    priority: 0,
    active: true,
  };
}

/** Pontos de partida prontos: ninguém começa de uma folha em branco. */
export const IDEAS: { label: string; draft: Draft }[] = [
  {
    label: "PROMO no direct → cupom",
    draft: {
      ...emptyDraft("dm_keyword"),
      name: "Cupom PROMO",
      matchMode: "exact",
      keywords: ["promo"],
      replyText: "Oi! Aqui está seu cupom: PROMO10 🎉",
    },
  },
  {
    label: "Perguntou o preço",
    draft: {
      ...emptyDraft("dm_keyword"),
      name: "Pergunta de preço",
      matchMode: "contains",
      keywords: ["preço", "valor", "quanto custa"],
      replyText: "Já te passo os valores! Me conta o que você procura?",
    },
  },
  {
    label: "Respondeu qualquer story",
    draft: { ...emptyDraft("story_reply"), name: "Resposta a story", replyText: "Que bom que você curtiu! Posso te ajudar com algo?" },
  },
  {
    label: "Agradecer menção",
    draft: {
      ...emptyDraft("story_mention"),
      name: "Agradecer menção",
      replyText: "Obrigado por marcar a gente! Como agradecimento, use o cupom VALEU10 💙",
    },
  },
];

export function describeMatch(t: Pick<Trigger, "kind" | "matchMode" | "storyId" | "includeReactions">): string {
  if (t.kind === "story_mention") return "Qualquer menção";
  const story = t.kind === "story_reply" ? (t.storyId ? "Um story específico" : "Qualquer story") : "";
  const modo = t.matchMode === "exact" ? "texto exato" : t.matchMode === "contains" ? "contém" : "qualquer resposta";
  return [story, modo, t.kind === "story_reply" && t.includeReactions ? "inclui reações" : ""].filter(Boolean).join(" · ");
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}
