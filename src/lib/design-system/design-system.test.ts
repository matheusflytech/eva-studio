import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastLevel, contrastRatio, formatRatio, hexToRgb } from "./contrast";
import { CONTRAST_PAIRS, SEMANTIC_TOKENS, THEMES, type ThemeName } from "./tokens";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  nextThemePreference,
  parseThemePreference,
  readThemeCookie,
  resolveTheme,
  serializeThemeCookie,
} from "./theme";
import {
  ariaSort,
  clampPage,
  formatPageRange,
  nextSort,
  pageItems,
  pageSelectionState,
  sortRows,
  togglePageSelection,
  totalPages,
} from "./pagination";
import { filterOptions, formatDelta, formatMoney, initials } from "./format";

describe("contraste", () => {
  it("calcula os extremos e um par conhecido", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 sobre branco é o cinza clássico de 4,54:1
    expect(contrastRatio("#767676", "#fff")).toBeCloseTo(4.54, 2);
  });

  it("é simétrico e aceita hex curto", () => {
    expect(contrastRatio("#2f5fd3", "#fafafa")).toBe(contrastRatio("#fafafa", "#2f5fd3"));
    expect(hexToRgb("#abc")).toEqual([170, 187, 204]);
    expect(() => hexToRgb("azul")).toThrow();
  });

  it("classifica nível e formata sem arredondar para cima", () => {
    expect(contrastLevel(7.1)).toBe("AAA");
    expect(contrastLevel(4.5)).toBe("AA");
    expect(contrastLevel(3.2)).toBe("AA texto grande");
    expect(contrastLevel(2)).toBe("falha");
    expect(formatRatio(4.499)).toBe("4,49");
  });
});

describe("tokens: contraste AA nos dois temas", () => {
  for (const tema of ["light", "dark"] as ThemeName[]) {
    for (const par of CONTRAST_PAIRS) {
      it(`${tema}: ${par.fg} sobre ${par.bg} >= ${par.min}`, () => {
        const ratio = contrastRatio(THEMES[tema][par.fg], THEMES[tema][par.bg]);
        expect(ratio).toBeGreaterThanOrEqual(par.min);
      });
    }
  }
});

describe("tokens: globals.css igual ao espelho em TS", () => {
  const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

  // Pega o corpo do primeiro bloco cujo seletor termina com o texto dado.
  function bloco(seletor: string): string {
    const inicio = css.indexOf(`${seletor} {`);
    expect(inicio, `bloco ${seletor} no globals.css`).toBeGreaterThanOrEqual(0);
    return css.slice(inicio, css.indexOf("}", inicio));
  }

  const blocos: Record<ThemeName, string> = {
    light: bloco('[data-theme="light"]'),
    dark: bloco('[data-theme="dark"]'),
  };

  for (const tema of ["light", "dark"] as ThemeName[]) {
    it(`tema ${tema} declara todos os tokens com o mesmo valor`, () => {
      for (const token of SEMANTIC_TOKENS) {
        const m = blocos[tema].match(new RegExp(`--${token}:\\s*([^;]+);`));
        expect(m?.[1]?.trim().toLowerCase(), `--${token} (${tema})`).toBe(THEMES[tema][token]);
      }
    });
  }

  it("mantém os nomes antigos e a ponte shadcn", () => {
    for (const nome of [
      "--color-bg-base",
      "--color-surface-1",
      "--color-surface-2",
      "--color-surface-3",
      "--color-text-primary",
      "--color-text-secondary",
      "--color-text-tertiary",
      "--color-border-subtle",
      "--color-border-default",
      "--color-border-strong",
      "--color-accent-400",
      "--color-accent-500",
      "--color-accent-600",
      "--color-accent-soft",
      "--color-danger",
      "--color-ice",
      "--color-background",
      "--color-primary",
      "--color-muted-foreground",
      "--color-ring",
    ]) {
      expect(css, nome).toContain(`${nome}:`);
    }
    expect(css).toContain(".glass-card {");
    expect(bloco(".glass-card")).not.toMatch(/backdrop-filter|box-shadow/);
  });

  it("componentes do design system não têm hex solto", () => {
    const dir = path.resolve(__dirname, "../../components/ui");
    const arquivos = ["button", "badge", "card", "input", "select", "checkbox", "switch", "tabs", "modal", "drawer", "dropdown-menu", "tooltip", "toast", "empty-state", "page-header", "toolbar", "filter-button", "view-tabs", "data-table", "pagination", "stat", "kanban-column", "skeleton", "avatar", "icon-button", "theme", "styles"];
    for (const a of arquivos) {
      const ext = a === "styles" ? "ts" : "tsx";
      const fonte = readFileSync(path.join(dir, `${a}.${ext}`), "utf8");
      expect(fonte, `${a}.${ext}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![\w-])/);
      expect(fonte, `${a}.${ext}: tamanho de texto arbitrário`).not.toMatch(/text-\[\d/);
    }
  });
});

describe("tema", () => {
  it("lê a preferência com padrão claro", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("roxo")).toBe("light");
    expect(parseThemePreference(null)).toBe("light");
  });

  it("resolve 'system' pelo sistema e respeita escolha explícita", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("alterna sistema → claro → escuro → sistema", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("lê e grava o cookie", () => {
    expect(readThemeCookie("a=1; eva-theme=dark; b=2")).toBe("dark");
    expect(readThemeCookie("eva-theme=xyz")).toBe("light");
    expect(readThemeCookie(undefined)).toBe("light");
    expect(serializeThemeCookie("light")).toMatch(/^eva-theme=light; Path=\/; Max-Age=\d+; SameSite=Lax$/);
  });

  // Executa o script do <head> de verdade, com um document/janela falsos.
  function rodarScript({ salvo, cookie = "", escuro = false, lsQuebrado = false }: { salvo?: string | null; cookie?: string; escuro?: boolean; lsQuebrado?: boolean }) {
    const attrs: Record<string, string> = {};
    const document = { cookie, documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const localStorage = {
      getItem: (k: string) => {
        if (lsQuebrado) throw new Error("bloqueado");
        return k === THEME_STORAGE_KEY ? (salvo ?? null) : null;
      },
    };
    const window = { matchMedia: (q: string) => ({ matches: q.includes("dark") && escuro }) };
    new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(document, localStorage, window);
    return attrs["data-theme"];
  }

  it("script do <head> segue a mesma regra de resolveTheme", () => {
    expect(rodarScript({ salvo: "dark" })).toBe("dark");
    expect(rodarScript({ salvo: "light", escuro: true })).toBe("light");
    expect(rodarScript({ salvo: "system", escuro: true })).toBe("dark");
    expect(rodarScript({ salvo: null, escuro: false })).toBe("light");
    expect(rodarScript({ salvo: null, cookie: "x=1; eva-theme=dark" })).toBe("dark");
    expect(rodarScript({ lsQuebrado: true, cookie: "eva-theme=dark" })).toBe("dark");
    expect(rodarScript({ salvo: "lixo", escuro: true })).toBe("light");
  });
});

describe("paginação", () => {
  it("formata o intervalo como '1–25 de 24.752'", () => {
    expect(formatPageRange(1, 25, 24752)).toBe("1–25 de 24.752");
    expect(formatPageRange(2, 25, 24752)).toBe("26–50 de 24.752");
    expect(formatPageRange(991, 25, 24752)).toBe("24.751–24.752 de 24.752");
    expect(formatPageRange(1, 100, 40)).toBe("1–40 de 40");
    expect(formatPageRange(1, 25, 0)).toBe("0 de 0");
    // página fora do intervalo é presa ao fim
    expect(formatPageRange(5000, 25, 24752)).toBe("24.751–24.752 de 24.752");
  });

  it("conta e prende páginas", () => {
    expect(totalPages(24752, 25)).toBe(991);
    expect(totalPages(0, 25)).toBe(1);
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(9, 100, 25)).toBe(4);
    expect(clampPage(Number.NaN, 100, 25)).toBe(1);
  });

  it("lista números com reticências e tamanho estável", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 991)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 991]);
    expect(pageItems(4, 991)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 991]);
    expect(pageItems(5, 991)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 991]);
    expect(pageItems(988, 991)).toEqual([1, "ellipsis-start", 987, 988, 989, 990, 991]);
    expect(pageItems(991, 991)).toEqual([1, "ellipsis-start", 987, 988, 989, 990, 991]);
    for (let p = 1; p <= 30; p++) expect(pageItems(p, 30)).toHaveLength(7);
  });
});

describe("seleção e ordenação da tabela", () => {
  const pagina = ["a", "b", "c"];

  it("estado do 'selecionar página'", () => {
    expect(pageSelectionState(pagina, new Set())).toBe("none");
    expect(pageSelectionState(pagina, new Set(["a", "z"]))).toBe("some");
    expect(pageSelectionState(pagina, new Set(["a", "b", "c", "z"]))).toBe("all");
    expect(pageSelectionState([], new Set(["a"]))).toBe("none");
  });

  it("marca a página toda ou desmarca só a página", () => {
    expect([...togglePageSelection(pagina, new Set(["a", "z"]))].sort()).toEqual(["a", "b", "c", "z"]);
    expect([...togglePageSelection(pagina, new Set(["a", "b", "c", "z"]))]).toEqual(["z"]);
  });

  it("cicla a ordenação e expõe aria-sort", () => {
    const asc = nextSort(null, "nome");
    expect(asc).toEqual({ key: "nome", direction: "asc" });
    expect(nextSort(asc, "nome")).toEqual({ key: "nome", direction: "desc" });
    expect(nextSort({ key: "nome", direction: "desc" }, "nome")).toBeNull();
    expect(nextSort(asc, "valor")).toEqual({ key: "valor", direction: "asc" });
    expect(ariaSort(asc, "nome")).toBe("ascending");
    expect(ariaSort(asc, "valor")).toBe("none");
  });

  it("ordena números, texto com acento e vazios no fim", () => {
    const linhas = [{ n: "Érica", v: 10 }, { n: "ana", v: null }, { n: "Bruno", v: 2 }];
    const pegar = (l: (typeof linhas)[number], k: string) => l[k as "n" | "v"];
    expect(sortRows(linhas, { key: "n", direction: "asc" }, pegar).map((l) => l.n)).toEqual(["ana", "Bruno", "Érica"]);
    expect(sortRows(linhas, { key: "v", direction: "desc" }, pegar).map((l) => l.v)).toEqual([10, 2, null]);
    expect(sortRows(linhas, null, pegar)).not.toBe(linhas);
  });
});

describe("formatação", () => {
  it("moeda, variação e iniciais", () => {
    expect(formatMoney(12400).replace(/\s/g, " ")).toBe("R$ 12.400");
    expect(formatDelta(12.4)).toBe("+12,4%");
    expect(formatDelta(-3)).toBe("−3,0%");
    expect(formatDelta(0)).toBe("0,0%");
    expect(initials("Ana Maria Souza")).toBe("AS");
    expect(initials("  joão ")).toBe("J");
    expect(initials("")).toBe("?");
  });

  it("filtra opções sem acento e sem caixa", () => {
    const ops = [{ value: "1", label: "João Lima" }, { value: "2", label: "Ana" }];
    expect(filterOptions(ops, "joao").map((o) => o.value)).toEqual(["1"]);
    expect(filterOptions(ops, "  ")).toHaveLength(2);
    expect(filterOptions(ops, "zz")).toEqual([]);
  });
});
