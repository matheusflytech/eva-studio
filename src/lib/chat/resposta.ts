// ---------------------------------------------------------------------------
// Resposta da Eva em blocos para a tela do chat. A IA escreve texto simples
// (frases e linhas com hífen); aqui vira: parágrafos, itens "rótulo: valor" e
// números/valores/datas marcados para destaque. Só texto: nada vira HTML.
// ---------------------------------------------------------------------------

export type Parte = { texto: string; destaque: boolean };
export type Bloco =
  | { tipo: "p"; partes: Parte[] }
  | { tipo: "item"; rotulo: string | null; partes: Parte[] }
  | { tipo: "espaco" };

// Data (04/11 ou 04/11/2026), dinheiro, porcentagem ou número.
const DESTAQUE = /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|R\$\s?\d[\d.]*(?:,\d+)?|\d[\d.]*(?:,\d+)?\s?%|\d[\d.]*(?:,\d+)?/g;

export function destacarNumeros(texto: string): Parte[] {
  const partes: Parte[] = [];
  let fim = 0;
  for (const m of texto.matchAll(DESTAQUE)) {
    const i = m.index;
    if (i > fim) partes.push({ texto: texto.slice(fim, i), destaque: false });
    partes.push({ texto: m[0], destaque: true });
    fim = i + m[0].length;
  }
  if (fim < texto.length) partes.push({ texto: texto.slice(fim), destaque: false });
  return partes;
}

export function blocosDaResposta(bruto: string): Bloco[] {
  // Se o modelo escrever markdown, tira os marcadores em vez de mostrar asteriscos.
  const texto = bruto.replace(/\*\*|`/g, "").replace(/^#{1,6}\s+/gm, "");
  const blocos: Bloco[] = [];
  for (const crua of texto.split("\n")) {
    const linha = crua.trim();
    if (!linha) {
      if (blocos.length && blocos[blocos.length - 1].tipo !== "espaco") blocos.push({ tipo: "espaco" });
      continue;
    }
    const item = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(linha);
    if (!item) {
      blocos.push({ tipo: "p", partes: destacarNumeros(linha) });
      continue;
    }
    const par = /^(.{1,48}?):\s+(\S.*)$/.exec(item[1]);
    blocos.push(par ? { tipo: "item", rotulo: par[1], partes: destacarNumeros(par[2]) } : { tipo: "item", rotulo: null, partes: destacarNumeros(item[1]) });
  }
  while (blocos.length && blocos[blocos.length - 1].tipo === "espaco") blocos.pop();
  return blocos;
}

/** Perguntas que a Eva sugere no fim da resposta: uma linha "SUGESTOES: a | b | c" que sai do texto mostrado. */
export function separarSugestoes(bruto: string): { texto: string; sugestoes: string[] } {
  const linhas = bruto.split("\n");
  const i = linhas.findLastIndex((l) => /^\s*(?:[-*•]\s*)?\**sugest(?:ões|oes)\**\s*:/i.test(l));
  if (i < 0) return { texto: bruto.trim(), sugestoes: [] };
  const sugestoes = linhas[i]
    .replace(/^[^:]*:/, "")
    .split("|")
    .map((t) => t.replace(/\*\*/g, "").trim())
    .filter((t) => t.length >= 4 && t.length <= 80)
    .slice(0, 3);
  return { texto: [...linhas.slice(0, i), ...linhas.slice(i + 1)].join("\n").trim(), sugestoes };
}
