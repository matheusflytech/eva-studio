import type { CategoryColor } from "./tokens";

/**
 * Classes Tailwind de cada cor de categoria, escritas por extenso.
 *
 * O Tailwind só gera a classe que aparece literal no código; montar
 * `text-cat-${cor}` em tempo de execução não funciona. Por isso a tabela.
 * Os valores vêm de --cat-* no globals.css (claro e escuro), então a mesma
 * classe serve nos dois temas.
 */
export interface CategoryClasses {
  /** texto e ícone */
  fg: string;
  /** fundo de chip, badge, ícone do bloco */
  subtle: string;
  /** ponto, alça de ligação */
  solid: string;
  /** borda de destaque (ex.: faixa esquerda do cartão do bloco) */
  border: string;
  /** cor CSS para quem não aceita classe (minimapa, SVG) */
  css: string;
}

export const CATEGORY_CLASSES: Record<CategoryColor, CategoryClasses> = {
  slate: { fg: "text-cat-slate", subtle: "bg-cat-slate-subtle", solid: "bg-cat-slate-solid", border: "border-l-cat-slate-solid", css: "var(--cat-slate-solid)" },
  blue: { fg: "text-cat-blue", subtle: "bg-cat-blue-subtle", solid: "bg-cat-blue-solid", border: "border-l-cat-blue-solid", css: "var(--cat-blue-solid)" },
  cyan: { fg: "text-cat-cyan", subtle: "bg-cat-cyan-subtle", solid: "bg-cat-cyan-solid", border: "border-l-cat-cyan-solid", css: "var(--cat-cyan-solid)" },
  teal: { fg: "text-cat-teal", subtle: "bg-cat-teal-subtle", solid: "bg-cat-teal-solid", border: "border-l-cat-teal-solid", css: "var(--cat-teal-solid)" },
  green: { fg: "text-cat-green", subtle: "bg-cat-green-subtle", solid: "bg-cat-green-solid", border: "border-l-cat-green-solid", css: "var(--cat-green-solid)" },
  amber: { fg: "text-cat-amber", subtle: "bg-cat-amber-subtle", solid: "bg-cat-amber-solid", border: "border-l-cat-amber-solid", css: "var(--cat-amber-solid)" },
  orange: { fg: "text-cat-orange", subtle: "bg-cat-orange-subtle", solid: "bg-cat-orange-solid", border: "border-l-cat-orange-solid", css: "var(--cat-orange-solid)" },
  red: { fg: "text-cat-red", subtle: "bg-cat-red-subtle", solid: "bg-cat-red-solid", border: "border-l-cat-red-solid", css: "var(--cat-red-solid)" },
  rose: { fg: "text-cat-rose", subtle: "bg-cat-rose-subtle", solid: "bg-cat-rose-solid", border: "border-l-cat-rose-solid", css: "var(--cat-rose-solid)" },
  violet: { fg: "text-cat-violet", subtle: "bg-cat-violet-subtle", solid: "bg-cat-violet-solid", border: "border-l-cat-violet-solid", css: "var(--cat-violet-solid)" },
  purple: { fg: "text-cat-purple", subtle: "bg-cat-purple-subtle", solid: "bg-cat-purple-solid", border: "border-l-cat-purple-solid", css: "var(--cat-purple-solid)" },
  indigo: { fg: "text-cat-indigo", subtle: "bg-cat-indigo-subtle", solid: "bg-cat-indigo-solid", border: "border-l-cat-indigo-solid", css: "var(--cat-indigo-solid)" },
};
