// ---------------------------------------------------------------------------
// Variáveis dos e-mails: {{contato.primeiro_nome}}, {{empresa.nome}},
// {{campo.cidade}}, com valor padrão: {{contato.primeiro_nome|padrao:"cliente"}}.
//
// Regra (crm-content-library): variável que resolve vazia SEM padrão bloqueia
// o envio — "Olá ," para mil pessoas é pior do que não mandar. Quem envia
// recebe a lista do que faltou.
//
// Puro: roda no navegador (prévia do editor) e no servidor (envio).
// ---------------------------------------------------------------------------

export interface DadosDasVariaveis {
  contato?: { nome?: string | null; email?: string | null; telefone?: string | null; cargo?: string | null };
  empresa?: { nome?: string | null };
  /** Campos personalizados do contato, pela chave. */
  campos?: Record<string, unknown>;
  /** Extras de quem envia (ex.: negocio.nome numa régua). Chave completa: "negocio.nome". */
  extras?: Record<string, string | null | undefined>;
}

export interface VariavelDisponivel {
  chave: string;
  rotulo: string;
}

/** As que o editor oferece no clique. Campos personalizados entram à parte. */
export const VARIAVEIS_DO_CONTATO: VariavelDisponivel[] = [
  { chave: "contato.primeiro_nome", rotulo: "Primeiro nome" },
  { chave: "contato.nome", rotulo: "Nome completo" },
  { chave: "contato.email", rotulo: "E-mail" },
  { chave: "contato.telefone", rotulo: "Telefone" },
  { chave: "contato.cargo", rotulo: "Cargo" },
  { chave: "empresa.nome", rotulo: "Empresa" },
];

const TOKEN = /\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)+)\s*(?:\|\s*padrao\s*:\s*"([^"]*)")?\s*\}\}/gi;

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(", ");
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v).trim();
}

function valorDa(chave: string, d: DadosDasVariaveis): string {
  const [grupo, ...resto] = chave.toLowerCase().split(".");
  const campo = resto.join(".");
  if (d.extras && chave.toLowerCase() in d.extras) return texto(d.extras[chave.toLowerCase()]);
  switch (grupo) {
    case "contato": {
      const c = d.contato ?? {};
      if (campo === "primeiro_nome") return texto(c.nome).split(/\s+/)[0] ?? "";
      if (campo === "nome") return texto(c.nome);
      if (campo === "email") return texto(c.email);
      if (campo === "telefone") return texto(c.telefone);
      if (campo === "cargo") return texto(c.cargo);
      return "";
    }
    case "empresa":
      return campo === "nome" ? texto(d.empresa?.nome) : "";
    case "campo":
      return texto(d.campos?.[campo]);
    default:
      return "";
  }
}

export interface Resolvido {
  texto: string;
  /** Variáveis que ficaram vazias e não tinham padrão (bloqueiam o envio). */
  faltando: string[];
}

/**
 * Troca as variáveis pelo valor. `escapar` recebe cada valor antes de entrar
 * (no HTML, para nome com "<" não virar tag).
 */
export function resolverVariaveis(modelo: string, dados: DadosDasVariaveis, escapar: (s: string) => string = (s) => s): Resolvido {
  const faltando: string[] = [];
  const saida = modelo.replace(TOKEN, (_t, chave: string, padrao: string | undefined) => {
    const v = valorDa(chave, dados);
    if (v) return escapar(v);
    if (padrao !== undefined) return escapar(padrao);
    if (!faltando.includes(chave)) faltando.push(chave);
    return "";
  });
  return { texto: saida, faltando };
}

/** Variáveis usadas num texto (para a prévia avisar antes de enviar). */
export function variaveisUsadas(modelo: string): string[] {
  const achadas = new Set<string>();
  for (const m of modelo.matchAll(TOKEN)) achadas.add(m[1].toLowerCase());
  return [...achadas];
}
