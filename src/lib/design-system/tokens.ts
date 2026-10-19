/**
 * Tokens do design system do Eva Studio — espelho em TypeScript dos valores
 * declarados em src/app/globals.css.
 *
 * A fonte de verdade visual é o CSS (é ele que o navegador lê). Este arquivo
 * existe para duas coisas que o CSS não faz sozinho:
 *   1. os testes calcularem o contraste de cada par de tokens nos dois temas;
 *   2. a página /design-system listar nomes, valores e contraste.
 * Um teste compara este arquivo com o globals.css: se alguém mudar um valor
 * num lado e esquecer o outro, a suíte quebra.
 */

export type ThemeName = "light" | "dark";

/** Nomes semânticos (sem o "--"). Componentes usam estes, nunca hex. */
export const SEMANTIC_TOKENS = [
  "surface-page",
  "surface-panel",
  "surface-raised",
  "surface-hover",
  "surface-overlay",
  "border-subtle",
  "border-default",
  "border-strong",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-disabled",
  "text-on-accent",
  "accent-solid",
  "accent-solid-hover",
  "accent-fg",
  "accent-subtle",
  "success-fg",
  "success-subtle",
  "warning-fg",
  "warning-subtle",
  "danger-fg",
  "danger-subtle",
  "danger-solid",
  "info-fg",
  "info-subtle",
  "focus-ring",
  "inverse-bg",
  "inverse-fg",
] as const;

export type SemanticToken = (typeof SEMANTIC_TOKENS)[number];

export const THEMES: Record<ThemeName, Record<SemanticToken, string>> = {
  light: {
    "surface-page": "#fafafa",
    "surface-panel": "#ffffff",
    "surface-raised": "#f4f4f5",
    "surface-hover": "#ebebee",
    "surface-overlay": "#ffffff",
    "border-subtle": "#ececef",
    "border-default": "#dcdce1",
    "border-strong": "#c4c4cc",
    "text-primary": "#18181b",
    "text-secondary": "#52525b",
    "text-tertiary": "#63636d",
    "text-disabled": "#a1a1aa",
    "text-on-accent": "#ffffff",
    "accent-solid": "#2f5fd3",
    "accent-solid-hover": "#264fb3",
    "accent-fg": "#2a56c4",
    "accent-subtle": "#edf2fd",
    "success-fg": "#17734a",
    "success-subtle": "#e7f5ee",
    "warning-fg": "#935a00",
    "warning-subtle": "#fcf2df",
    "danger-fg": "#c22f2f",
    "danger-subtle": "#fdeded",
    "danger-solid": "#c22f2f",
    "info-fg": "#1f66a8",
    "info-subtle": "#e8f1fa",
    "focus-ring": "#2f5fd3",
    "inverse-bg": "#18181b",
    "inverse-fg": "#fafafa",
  },
  dark: {
    "surface-page": "#0e0e10",
    "surface-panel": "#151518",
    "surface-raised": "#1c1c20",
    "surface-hover": "#26262b",
    "surface-overlay": "#1c1c20",
    "border-subtle": "#222227",
    "border-default": "#2e2e34",
    "border-strong": "#3d3d45",
    "text-primary": "#ececef",
    "text-secondary": "#a6a6b0",
    "text-tertiary": "#91919b",
    "text-disabled": "#55555e",
    "text-on-accent": "#ffffff",
    "accent-solid": "#3b67cc",
    "accent-solid-hover": "#3359b3",
    "accent-fg": "#8cb0f7",
    "accent-subtle": "#17213a",
    "success-fg": "#4cc38a",
    "success-subtle": "#11261b",
    "warning-fg": "#e3a547",
    "warning-subtle": "#2a2010",
    "danger-fg": "#f07575",
    "danger-subtle": "#2d1617",
    "danger-solid": "#c43b3b",
    "info-fg": "#6cb1ef",
    "info-subtle": "#122338",
    "focus-ring": "#8cb0f7",
    "inverse-bg": "#ececef",
    "inverse-fg": "#151518",
  },
};

export interface ContrastPair {
  fg: SemanticToken;
  bg: SemanticToken;
  /** 4.5 para texto; 3 para indicador de foco e componentes de interface. */
  min: number;
  uso: string;
}

const TEXTO_EM: SemanticToken[] = ["surface-page", "surface-panel", "surface-raised", "surface-hover"];

/** Pares que precisam passar em AA nos dois temas. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...(["text-primary", "text-secondary", "text-tertiary"] as SemanticToken[]).flatMap((fg) =>
    TEXTO_EM.map((bg) => ({ fg, bg, min: 4.5, uso: "texto sobre superfície" }))
  ),
  { fg: "accent-fg", bg: "surface-page", min: 4.5, uso: "link/ação em texto" },
  { fg: "accent-fg", bg: "surface-panel", min: 4.5, uso: "link/ação em texto" },
  { fg: "accent-fg", bg: "accent-subtle", min: 4.5, uso: "item selecionado" },
  { fg: "text-on-accent", bg: "accent-solid", min: 4.5, uso: "botão primário" },
  { fg: "text-on-accent", bg: "accent-solid-hover", min: 4.5, uso: "botão primário (hover)" },
  { fg: "text-on-accent", bg: "danger-solid", min: 4.5, uso: "botão de perigo" },
  ...(["success", "warning", "danger", "info"] as const).flatMap((s) => [
    { fg: `${s}-fg` as SemanticToken, bg: `${s}-subtle` as SemanticToken, min: 4.5, uso: "badge de status" },
    { fg: `${s}-fg` as SemanticToken, bg: "surface-panel" as SemanticToken, min: 4.5, uso: "texto de status" },
  ]),
  { fg: "inverse-fg", bg: "inverse-bg", min: 4.5, uso: "tooltip / selecionado forte" },
  { fg: "focus-ring", bg: "surface-page", min: 3, uso: "anel de foco" },
  { fg: "focus-ring", bg: "surface-panel", min: 3, uso: "anel de foco" },
];

/** Escala tipográfica nomeada. Classe Tailwind: text-{nome}. */
export const TYPE_SCALE = [
  { nome: "caption", px: 12, lineHeight: 16, peso: 400, uso: "metadados, rodapé de tabela, contagem" },
  { nome: "small", px: 13, lineHeight: 18, peso: 400, uso: "células de tabela, filtros, itens de menu" },
  { nome: "body", px: 14, lineHeight: 20, peso: 400, uso: "texto padrão da interface" },
  { nome: "body-lg", px: 16, lineHeight: 24, peso: 400, uso: "texto corrido, descrições longas" },
  { nome: "title-sm", px: 18, lineHeight: 26, peso: 600, uso: "título de seção e de modal" },
  { nome: "title", px: 20, lineHeight: 28, peso: 600, uso: "título de painel grande" },
  { nome: "heading", px: 24, lineHeight: 32, peso: 600, uso: "título de página" },
  { nome: "display", px: 30, lineHeight: 38, peso: 600, uso: "número de destaque (Stat grande)" },
] as const;

/** Espaçamento base 4 (escala do Tailwind: 1 = 4px). */
export const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;

export const RADII = [
  { classe: "rounded-sm", px: 4, uso: "badge, checkbox, chip de contagem" },
  { classe: "rounded-md", px: 6, uso: "botão, input, select, item de menu" },
  { classe: "rounded-lg", px: 8, uso: "painel, cartão, tabela" },
  { classe: "rounded-xl", px: 12, uso: "só overlay: modal, gaveta, menu grande" },
] as const;

export const MOTION = [
  { nome: "rápido", ms: 120, uso: "hover, foco, troca de cor" },
  { nome: "base", ms: 160, uso: "abrir menu, tooltip, recolher coluna" },
  { nome: "lento", ms: 200, uso: "modal, gaveta, toast" },
] as const;
