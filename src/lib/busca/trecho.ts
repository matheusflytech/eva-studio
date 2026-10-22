import { semAcento } from "./consulta";

// ---------------------------------------------------------------------------
// Trecho de nota/mensagem com o termo destacado. O destaque é por posição no
// texto ORIGINAL (com acento): a comparação é sem acento, mas a tela mostra o
// que foi escrito.
// ---------------------------------------------------------------------------

export interface Trecho {
  texto: string;
  /** [início, fim) de cada destaque em `texto`. */
  destaques: [number, number][];
}

/** Texto sem acento + posição de cada caractere dele no original. */
function mapear(original: string): { norm: string; origem: number[] } {
  let norm = "";
  const origem: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const n = semAcento(original[i]);
    for (const ch of n) {
      norm += ch;
      origem.push(i);
    }
  }
  return { norm, origem };
}

const COMECO_DE_PALAVRA = /[^\p{L}\p{N}]/u;

export function trechoComDestaque(textoBruto: string, termos: string[], raio = 60): Trecho {
  const original = textoBruto.replace(/\s+/g, " ").trim();
  const { norm, origem } = mapear(original);

  // Cada ocorrência de cada termo no começo de uma palavra.
  const achados: [number, number][] = [];
  for (const termo of termos) {
    const t = semAcento(termo);
    if (!t) continue;
    let de = norm.indexOf(t);
    while (de !== -1) {
      if (de === 0 || COMECO_DE_PALAVRA.test(norm[de - 1])) {
        const ini = origem[de];
        const fimNorm = de + t.length - 1;
        // Fim no original: depois do último caractere (e das marcas que vêm junto).
        let fim = origem[fimNorm] + 1;
        while (fim < original.length && /\p{M}/u.test(original[fim])) fim++;
        achados.push([ini, fim]);
      }
      de = norm.indexOf(t, de + 1);
    }
  }
  achados.sort((a, b) => a[0] - b[0]);
  // Sem sobreposição.
  const unidos: [number, number][] = [];
  for (const a of achados) {
    const u = unidos[unidos.length - 1];
    if (u && a[0] <= u[1]) u[1] = Math.max(u[1], a[1]);
    else unidos.push([a[0], a[1]]);
  }

  const max = raio * 2;
  if (original.length <= max) return { texto: original, destaques: unidos };

  const centro = unidos[0]?.[0] ?? 0;
  let ini = Math.max(0, centro - raio);
  const fim = Math.min(original.length, ini + max);
  ini = Math.max(0, fim - max);
  const prefixo = ini > 0 ? "…" : "";
  const sufixo = fim < original.length ? "…" : "";
  const desloc = prefixo.length - ini;
  return {
    texto: `${prefixo}${original.slice(ini, fim)}${sufixo}`,
    destaques: unidos
      .filter(([a, b]) => a >= ini && b <= fim)
      .map(([a, b]) => [a + desloc, b + desloc] as [number, number]),
  };
}

/** Pedaços para desenhar (<mark> nos marcados). */
export function partesDoTrecho(t: Trecho): { texto: string; marcado: boolean }[] {
  const partes: { texto: string; marcado: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of t.destaques) {
    if (a > pos) partes.push({ texto: t.texto.slice(pos, a), marcado: false });
    partes.push({ texto: t.texto.slice(a, b), marcado: true });
    pos = b;
  }
  if (pos < t.texto.length) partes.push({ texto: t.texto.slice(pos), marcado: false });
  return partes;
}
