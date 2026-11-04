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
