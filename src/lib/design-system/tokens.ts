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
  "text-on-danger",
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
    "surface-page": "#f5f5f7",
    "surface-panel": "#ffffff",
    "surface-raised": "#f0f0f2",
    "surface-hover": "#e8e8eb",
    "surface-overlay": "#ffffff",
    "border-subtle": "#e5e5ea",
    "border-default": "#d8d8dd",
    "border-strong": "#c4c4ca",
    "text-primary": "#1d1d1f",
    "text-secondary": "#505054",
    "text-tertiary": "#5c5c61",
    "text-disabled": "#a1a1a6",
    "text-on-accent": "#ffffff",
    "text-on-danger": "#ffffff",
    "accent-solid": "#1f6fd6",
    "accent-solid-hover": "#1a62c0",
    "accent-fg": "#1a5fbf",
    "accent-subtle": "#eaf1fc",
    "success-fg": "#2d6b4f",
    "success-subtle": "#e9f2ed",
    "warning-fg": "#8a5300",
    "warning-subtle": "#f8f0e0",
    "danger-fg": "#c42b2b",
    "danger-subtle": "#fbeaea",
    "danger-solid": "#c42b2b",
    "info-fg": "#1a5fbf",
    "info-subtle": "#eaf1fc",
    "focus-ring": "#1f6fd6",
    "inverse-bg": "#1d1d1f",
    "inverse-fg": "#f5f5f7",
  },
  dark: {
    "surface-page": "#0a0a0b",
    "surface-panel": "#121214",
    "surface-raised": "#161618",
    "surface-hover": "#1f1f22",
    "surface-overlay": "#1c1c1f",
    "border-subtle": "#1c1c1f",
    "border-default": "#2a2a2e",
    "border-strong": "#3a3a3e",
    "text-primary": "#f2f2f4",
    "text-secondary": "#a8a8ad",
    "text-tertiary": "#8e8e94",
    "text-disabled": "#55555b",
    "text-on-accent": "#ffffff",
    "text-on-danger": "#ffffff",
    "accent-solid": "#1f6fd6",
    "accent-solid-hover": "#1a62c0",
    "accent-fg": "#7ab8ff",
    "accent-subtle": "#13233b",
    "success-fg": "#86c4a3",
    "success-subtle": "#121d17",
    "warning-fg": "#e0b062",
    "warning-subtle": "#1f1a10",
    "danger-fg": "#f07a7a",
    "danger-subtle": "#241414",
    "danger-solid": "#c43b3b",
    "info-fg": "#7ab8ff",
    "info-subtle": "#11192a",
    "focus-ring": "#7ab8ff",
    "inverse-bg": "#f2f2f4",
    "inverse-fg": "#111113",
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
  { fg: "text-on-danger", bg: "danger-solid", min: 4.5, uso: "botão de perigo" },
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

/* ---------------------------------------------------------------------------
   Cores de categoria.

   Para DADO que precisa de cor própria e não é status: tipo de bloco do
   builder, etapa do funil, etiqueta. Cada cor tem três papéis por tema:
     - fg:     texto e ícone (>= 4,5 sobre subtle, panel e raised);
     - subtle: fundo de chip/badge e do ícone do bloco;
     - solid:  ponto, alça de ligação, minimapa (>= 3 sobre panel: é
               componente de interface, não texto).
   Classes Tailwind: text-cat-{cor}, bg-cat-{cor}-subtle, bg-cat-{cor}-solid,
   border-cat-{cor}-solid/40. Nunca usar a paleta crua do Tailwind
   (text-violet-400...) para isso: ela some no tema claro.
   --------------------------------------------------------------------------- */

export const CATEGORY_COLORS = [
  "slate",
  "blue",
  "cyan",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "rose",
  "violet",
  "purple",
  "indigo",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
export type CategoryRole = "fg" | "subtle" | "solid";

export const CATEGORY_THEMES: Record<ThemeName, Record<CategoryColor, Record<CategoryRole, string>>> = {
  light: {
    slate: { fg: "#475569", subtle: "#eef1f6", solid: "#64748b" },
    blue: { fg: "#1d5fb8", subtle: "#e8f1fc", solid: "#2f7de1" },
    cyan: { fg: "#0b6479", subtle: "#e1f4f9", solid: "#0a8aa8" },
    teal: { fg: "#0b665f", subtle: "#e0f4f1", solid: "#0d8f84" },
    green: { fg: "#17734a", subtle: "#e7f5ee", solid: "#1e9a5c" },
    amber: { fg: "#8a5300", subtle: "#fcf2df", solid: "#c27803" },
    orange: { fg: "#a3410c", subtle: "#fdeee4", solid: "#dd5a10" },
    red: { fg: "#c22f2f", subtle: "#fdeded", solid: "#d93636" },
    rose: { fg: "#b4234f", subtle: "#fdecf1", solid: "#dc2f5f" },
    violet: { fg: "#6a3fd1", subtle: "#f1ecfd", solid: "#8257e8" },
    purple: { fg: "#8a2fb5", subtle: "#f6eafb", solid: "#a24fd0" },
    indigo: { fg: "#4549c9", subtle: "#eceefd", solid: "#5f63e8" },
  },
  dark: {
    slate: { fg: "#b5c0cf", subtle: "#1a2333", solid: "#8c9bb0" },
    blue: { fg: "#8ec2fb", subtle: "#10243f", solid: "#4f9cf3" },
    cyan: { fg: "#74d3ec", subtle: "#0d2833", solid: "#22b8d8" },
    teal: { fg: "#6fd8cb", subtle: "#0e2a2a", solid: "#25b5a6" },
    green: { fg: "#6fd39f", subtle: "#11261b", solid: "#38b26f" },
    amber: { fg: "#f0bb5c", subtle: "#2a2010", solid: "#e3a23a" },
    orange: { fg: "#f9a26c", subtle: "#2e1a10", solid: "#f08240" },
    red: { fg: "#f58b8b", subtle: "#2d1617", solid: "#ec6262" },
    rose: { fg: "#f68fab", subtle: "#2e1520", solid: "#ee5f86" },
    violet: { fg: "#b9a3fa", subtle: "#1d1838", solid: "#9c80f5" },
    purple: { fg: "#d29ff5", subtle: "#251636", solid: "#bb7ff0" },
    indigo: { fg: "#a5adfb", subtle: "#181d3d", solid: "#7d87f5" },
  },
};
