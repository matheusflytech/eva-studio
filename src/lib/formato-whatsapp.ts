// Texto da IA (markdown) no jeito do WhatsApp: *negrito*, _itálico_, ~riscado~,
// sem títulos, tabelas nem [links](url), que lá chegam como símbolos soltos.
// E a resposta longa em até 3 balões, como uma pessoa digitando.

const NEGRITO = "\u0001"; // marcador provisório: o "*" de itálico do markdown não pode virar negrito

const semNegrito = (s: string) => s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2");

function celulas(linha: string): string[] {
  return linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Tabela vira uma linha por item: "*primeira coluna*: resto". */
function tabelaEmLinhas(linhas: string[]): string[] {
  const [cabecalho, , ...corpo] = linhas;
  const titulos = celulas(cabecalho);
  return corpo.map((l) => {
    const [primeira, ...resto] = celulas(l);
    const valores =
      resto.length === 1 ? resto[0] : resto.map((v, i) => `${titulos[i + 1] ?? ""}: ${v}`.replace(/^: /, "")).join(" · ");
    return `• ${NEGRITO}${semNegrito(primeira)}${NEGRITO}${valores ? `: ${valores}` : ""}`;
  });
}

const ehLinhaDeTabela = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const ehSeparadorDeTabela = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

/** Negrito, itálico, riscado e links numa linha fora de bloco de código. */
function marcasDaLinha(l: string): string {
  return l
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, "$2")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, url: string) => (t === url ? url : `${t}: ${url}`))
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, `${NEGRITO}$1$2${NEGRITO}`)
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g, "$1_$2_")
    .replace(/~~(.+?)~~/g, "~$1~");
}

export function paraWhatsApp(md: string): string {
  const linhas = md.replace(/\r\n?/g, "\n").split("\n");
  const saida: string[] = [];
  let emCodigo = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (/^\s*```/.test(linha)) emCodigo = !emCodigo;
    if (emCodigo || /^\s*```/.test(linha)) {
      saida.push(linha); // bloco de código o WhatsApp mostra igual
      continue;
    }
    if (ehLinhaDeTabela(linha) && ehSeparadorDeTabela(linhas[i + 1] ?? "")) {
      const tabela = [linha];
      for (i++; i < linhas.length && (ehLinhaDeTabela(linhas[i]) || ehSeparadorDeTabela(linhas[i])); i++) tabela.push(linhas[i]);
      i--;
      saida.push(...tabelaEmLinhas(tabela).map(marcasDaLinha));
      continue;
    }
    const titulo = linha.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
    if (titulo) {
      saida.push(marcasDaLinha(`${NEGRITO}${semNegrito(titulo[1])}${NEGRITO}`));
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(linha)) continue; // linha horizontal
    saida.push(marcasDaLinha(linha.replace(/^(\s*)[-*+]\s+/, "$1• ").replace(/\s+$/, "")));
  }

  return saida
    .join("\n")
    .replaceAll(NEGRITO, "*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Abaixo disto a resposta vai num balão só. */
const CURTA = 120;

/** Divide por parágrafo em até `maximo` balões de tamanho parecido. */
export function emBaloes(texto: string, maximo = 3): string[] {
  const t = texto.trim();
  if (t.length < CURTA || t.includes("```")) return [t];
  const paragrafos = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragrafos.length <= maximo) return paragrafos;

  const alvo = t.length / maximo;
  const baloes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  paragrafos.forEach((p, i) => {
    atual.push(p);
    tamanho += p.length;
    const faltam = paragrafos.length - i - 1;
    // Fecha o balão quando encheu, sem deixar o último ficar com mais de um balão de sobra.
    if (baloes.length < maximo - 1 && faltam > 0 && (tamanho >= alvo || faltam < maximo - 1 - baloes.length)) {
      baloes.push(atual.join("\n\n"));
      atual = [];
      tamanho = 0;
    }
  });
  if (atual.length) baloes.push(atual.join("\n\n"));
  return baloes;
}

/** Quanto tempo mostrar "digitando…" antes de um balão (ms). */
export function pausaDeDigitacao(texto: string): number {
  return Math.min(2500, Math.max(800, 800 + texto.length * 12));
}
