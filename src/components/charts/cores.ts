// Cores das séries dos gráficos: só cor de dado. O azul de destaque vem
// primeiro (a série principal) e depois as cores de categoria do tema, que
// têm versão clara e escura. Classes escritas por extenso para o Tailwind
// gerar; `css` serve para SVG (stroke/fill por estilo).
export const CORES_DE_SERIE = [
  { fundo: "bg-accent-solid", css: "var(--color-accent-solid)" },
  { fundo: "bg-cat-teal-solid", css: "var(--color-cat-teal-solid)" },
  { fundo: "bg-cat-amber-solid", css: "var(--color-cat-amber-solid)" },
  { fundo: "bg-cat-violet-solid", css: "var(--color-cat-violet-solid)" },
  { fundo: "bg-cat-rose-solid", css: "var(--color-cat-rose-solid)" },
  { fundo: "bg-cat-slate-solid", css: "var(--color-cat-slate-solid)" },
] as const;
