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
// cada card (mensagem é sempre verde, decisão é sempre violeta, em qualquer
// fluxo). Vem da paleta de "cores de categoria" do design system, que tem
// variante clara e escura com contraste AA testado.
// v6: as mesmas famílias do fluxograma de automações (visualDoPasso em
// components/automacoes/comum.tsx): mensagem verde, condição violeta, espera e
// fim em cinza, e-mail ciano, integração rosa, equipe laranja. A IA fica no
// azul (o acento da Eva) e as ferramentas dela no índigo, da mesma família.
export const BLOCK_CATEGORY: Record<IconKey, CategoryColor> = {
  start: "amber",
  message: "green",
  capture: "green",
  condition: "violet",
  variable: "slate",
  wait: "slate",
  human: "orange",
  end: "slate",
  email: "cyan",
  http: "rose",
  webhook: "rose",
  agent: "rose",
  "ai-agent": "blue",
  "tool-http": "indigo",
  "tool-knowledge": "indigo",
  "tool-mcp": "indigo",
  "tool-crm": "indigo",
  "crm-deal": "teal",
  "crm-stage": "teal",
  "crm-task": "teal",
  "crm-tag": "teal",
  "crm-update": "teal",
  "crm-note": "teal",
  "crm-lookup": "teal",
  "studio-block": "green",
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
