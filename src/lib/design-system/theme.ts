/**
 * Escolha de tema (claro/escuro) — lógica pura, sem React.
 *
 * Preferência do usuário: "light" (padrão: a Eva é clara, com menu escuro) ou "dark". Não segue o tema do
 * sistema operacional (decisão do produto, 23/10/2026): quem tinha "system" salvo volta ao claro. Fica salva em
 * localStorage e também num cookie, para o servidor poder ler um dia sem
 * mudar o formato. O tema resolvido vai no atributo data-theme do <html>.
 *
 * O script de THEME_INIT_SCRIPT roda no <head> antes da primeira pintura
 * (ver node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md),
 * então a tela não pisca no tema errado. Ele repete a mesma regra de
 * parseThemePreference + resolveTheme; o teste executa o script de verdade
 * para garantir que os dois não divergem.
 */

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "eva-theme";
export const THEME_COOKIE = "eva-theme";
/** Um ano: preferência de tema não expira na prática. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Sem escolha salva, a Eva abre clara (decisão do produto, 20/10/2026). */
export const PREFERENCIA_PADRAO: ThemePreference = "light";

export function parseThemePreference(valor: unknown): ThemePreference {
  return valor === "light" || valor === "dark" ? valor : PREFERENCIA_PADRAO;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref;
}

/** Botão de alternar: claro ↔ escuro. */
export function nextThemePreference(pref: ThemePreference): ThemePreference {
  return pref === "light" ? "dark" : "light";
}

/** Lê a preferência de um header Cookie ("a=1; eva-theme=dark"). */
export function readThemeCookie(cookieHeader: string | null | undefined): ThemePreference {
  if (!cookieHeader) return PREFERENCIA_PADRAO;
  const par = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${THEME_COOKIE}=`));
  return parseThemePreference(par?.slice(THEME_COOKIE.length + 1));
}

export function serializeThemeCookie(pref: ThemePreference): string {
  return `${THEME_COOKIE}=${pref}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Script inline do <head>. ES5 de propósito (roda antes de qualquer bundle) e
 * todo envolto em try: localStorage pode lançar em aba anônima/bloqueada.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},p=null;try{p=localStorage.getItem(k)}catch(e){}if(p!=="light"&&p!=="dark"){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);p=m?m[1]:${JSON.stringify("light")}}var r=document.documentElement;r.setAttribute("data-theme",p==="dark"?"dark":"light")}catch(e){}})();`;

/*
 * Canvas do builder. Por padrão acompanha o tema (claro no claro, escuro no
 * escuro); quem prefere montar fluxo no escuro marca "sempre escuro" e o
 * resto do app continua no tema escolhido. Preferência só deste navegador
 * (localStorage), como o tema.
 */
export type CanvasPreference = "tema" | "escuro";
export const CANVAS_STORAGE_KEY = "eva-canvas";

export function parseCanvasPreference(valor: unknown): CanvasPreference {
  return valor === "escuro" ? "escuro" : "tema";
}

export function resolveCanvasTheme(pref: CanvasPreference, temaDoApp: ResolvedTheme): ResolvedTheme {
  return pref === "escuro" ? "dark" : temaDoApp;
}
