import type { IconKey } from "./icon-registry";
import type { CategoryColor } from "@/lib/design-system/tokens";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";

export interface BlockStyle {
  badgeBg: string;
  badgeText: string;
  /** faixa esquerda do cartão */
  border: string;
  dot: string;
}

// Cor por categoria de bloco — pra ler o canvas de longe sem precisar abrir
// cada card (mensagem é sempre azul, decisão é sempre âmbar, em qualquer
// fluxo). Vem da paleta de "cores de categoria" do design system, que tem
// variante clara e escura com contraste AA testado; nada de text-violet-400
// solto, que sumia no tema claro (o Início era branco sobre branco).
// Violeta fica com a IA, como no resto do produto.
export const BLOCK_CATEGORY: Record<IconKey, CategoryColor> = {
  start: "green",
  message: "blue",
  capture: "indigo",
  condition: "amber",
  variable: "slate",
  wait: "slate",
  human: "orange",
  end: "red",
  email: "rose",
  http: "cyan",
  webhook: "cyan",
  agent: "purple",
  "ai-agent": "violet",
  "tool-http": "purple",
  "tool-knowledge": "purple",
  "tool-mcp": "purple",
  "tool-crm": "purple",
  "crm-deal": "teal",
  "crm-stage": "teal",
  "crm-task": "teal",
  "crm-tag": "teal",
  "crm-update": "teal",
  "crm-note": "teal",
  "crm-lookup": "teal",
};

export const BLOCK_STYLES: Record<IconKey, BlockStyle> = Object.fromEntries(
  (Object.keys(BLOCK_CATEGORY) as IconKey[]).map((k) => {
    const c = CATEGORY_CLASSES[BLOCK_CATEGORY[k]];
    return [k, { badgeBg: c.subtle, badgeText: c.fg, border: c.border, dot: c.solid }];
  })
) as Record<IconKey, BlockStyle>;

// Cor CSS (var(--cat-*-solid)) para o minimapa do React Flow, que não aceita
// classe Tailwind. Acompanha o tema sozinha.
export const BLOCK_MINIMAP_COLOR: Record<IconKey, string> = Object.fromEntries(
  (Object.keys(BLOCK_CATEGORY) as IconKey[]).map((k) => [k, CATEGORY_CLASSES[BLOCK_CATEGORY[k]].css])
) as Record<IconKey, string>;
