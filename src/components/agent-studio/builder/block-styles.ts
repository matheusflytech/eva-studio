import type { IconKey } from "./icon-registry";

export interface BlockStyle {
  badgeBg: string;
  badgeText: string;
  border: string;
  dot: string;
}

// Cor por categoria de bloco — pra ler o canvas de longe sem precisar abrir
// cada card (mesma ideia do ManyChat/Chatfuel: mensagem é sempre azul, ação
// é sempre outra cor, em qualquer fluxo).
export const BLOCK_STYLES: Record<IconKey, BlockStyle> = {
  start: { badgeBg: "bg-white/10", badgeText: "text-white", border: "border-white/25", dot: "bg-white" },
  message: { badgeBg: "bg-blue-500/15", badgeText: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
  capture: { badgeBg: "bg-violet-500/15", badgeText: "text-violet-400", border: "border-violet-500/30", dot: "bg-violet-400" },
  agent: { badgeBg: "bg-accent-soft", badgeText: "text-accent-400", border: "border-accent-500/30", dot: "bg-accent-400" },
  condition: { badgeBg: "bg-amber-500/15", badgeText: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400" },
  variable: { badgeBg: "bg-slate-400/15", badgeText: "text-slate-300", border: "border-slate-400/30", dot: "bg-slate-300" },
  webhook: { badgeBg: "bg-cyan-500/15", badgeText: "text-cyan-400", border: "border-cyan-500/30", dot: "bg-cyan-400" },
  human: { badgeBg: "bg-orange-500/15", badgeText: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  wait: { badgeBg: "bg-indigo-500/15", badgeText: "text-indigo-400", border: "border-indigo-500/30", dot: "bg-indigo-400" },
  end: { badgeBg: "bg-danger/15", badgeText: "text-danger", border: "border-danger/30", dot: "bg-danger" },
};
