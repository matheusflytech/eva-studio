// ---------------------------------------------------------------------------
// Fundo vivo: curvas de nível (como num mapa topográfico) desenhadas sobre um
// campo de ruído que muda devagar com o tempo. Cada ação da pessoa pode soltar
// um "pulso", uma onda que sai do ponto da ação e ondula as curvas em volta.
//
// Puro: não sabe de React nem de DOM além do canvas que recebe. O componente
// FundoVivo cuida do laço de animação, do tema e de pausar fora da tela.
// ---------------------------------------------------------------------------

/** Tabela de permutação fixa: o desenho é o mesmo a cada carga da página. */
const P = (() => {
  const p = new Uint8Array(512);
  let s = 1337;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return p;
})();

const h = (x: number, y: number, z: number) => P[P[P[x & 255] + (y & 255)] + (z & 255)] / 255;
const suave = (t: number) => t * t * (3 - 2 * t);

/** Ruído de valor 3D, de 0 a 1, contínuo. */
export function ruido(x: number, y: number, z: number): number {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = suave(x - X), fy = suave(y - Y), fz = suave(z - Z);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = l(h(X, Y, Z), h(X + 1, Y, Z), fx), c10 = l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), fx);
  const c01 = l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), fx), c11 = l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), fx);
  return l(l(c00, c10, fy), l(c01, c11, fy), fz);
}

/** Três oitavas: relevo com morros grandes e detalhe fino. */
export function relevo(x: number, y: number, z: number): number {
  return ruido(x, y, z) * 0.62 + ruido(x * 2.1, y * 2.1, z * 1.3) * 0.28 + ruido(x * 4.3, y * 4.3, z) * 0.1;
}

/**
 * Marching squares: para cada combinação dos 4 cantos acima/abaixo do nível,
 * quais bordas da célula a curva liga. Bordas: 0 topo, 1 direita, 2 baixo,
 * 3 esquerda. Cantos: 8 sup. esq., 4 sup. dir., 2 inf. dir., 1 inf. esq.
 */
export const SEGMENTOS: Record<number, number[]> = {
  1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [0, 1], 5: [3, 0, 2, 1], 6: [0, 2], 7: [3, 0],
  8: [3, 0], 9: [0, 2], 10: [0, 1, 3, 2], 11: [0, 1], 12: [3, 1], 13: [2, 1], 14: [3, 2],
};

interface Pulso { x: number; y: number; forca: number; raio: number }

export interface OpcoesDoCampo {
  /** Multiplica a opacidade das linhas (1 = discreto, 3 = presente). */
  forca?: number;
  niveis?: number;
  /** Lado da célula da grade em px do canvas. Maior = mais leve. */
  passo?: number;
}

export class CampoDeCurvas {
  private ctx: CanvasRenderingContext2D;
  private t = 7.3;
  private agito = 0;
  private pulsos: Pulso[] = [];
  private opc: Required<OpcoesDoCampo>;
  /** Escala do canvas em relação ao tamanho na tela (desenha em resolução menor). */
  readonly resolucao = 0.6;

  constructor(private canvas: HTMLCanvasElement, opc: OpcoesDoCampo = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponível");
    this.ctx = ctx;
    this.opc = { forca: 1, niveis: 16, passo: 9, ...opc };
  }

  /** Onda que sai de (x, y), em px da tela relativos ao canvas. */
  pulsar(x: number, y: number, forca = 1) {
    this.pulsos.push({ x: x * this.resolucao, y: y * this.resolucao, forca, raio: 0 });
    this.agito = Math.min(1.6, this.agito + forca * 0.6);
  }

  /** Desenha um quadro. `dt` em segundos; 0 congela o tempo (reduzir movimento). */
  desenhar(dt: number, escuro: boolean) {
    const { canvas, ctx } = this;
    const w = Math.round(canvas.clientWidth * this.resolucao), hgt = Math.round(canvas.clientHeight * this.resolucao);
    if (!w || !hgt) return;
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w;
      canvas.height = hgt;
    }
    const s = this.opc.passo, cols = Math.ceil(w / s) + 1, rows = Math.ceil(hgt / s) + 1;
    this.t += dt * 0.045 * (1 + this.agito * 2.2);
    this.agito *= Math.pow(0.35, dt);
    for (let i = this.pulsos.length - 1; i >= 0; i--) {
      const p = this.pulsos[i];
      p.raio += dt * 420 * this.resolucao;
      p.forca *= Math.pow(0.42, dt);
      if (p.forca < 0.02) this.pulsos.splice(i, 1);
    }
    const esc = 0.0042 / this.resolucao, r2 = 2600 * this.resolucao * this.resolucao;
    const v = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const px = x * s, py = y * s;
        let val = relevo(px * esc, py * esc, this.t);
        for (const p of this.pulsos) {
          const d = Math.hypot(px - p.x, py - p.y) - p.raio;
          val += p.forca * 0.16 * Math.exp(-(d * d) / r2);
        }
        v[y * cols + x] = val;
      }

    ctx.clearRect(0, 0, w, hgt);
    ctx.lineWidth = 1;
    const N = this.opc.niveis;
    for (let n = 1; n < N; n++) {
      const L = 0.18 + (n / N) * 0.62;
      const alfa = (escuro ? 0.075 : 0.06) * this.opc.forca * (n % 4 === 0 ? 1.7 : 1);
      ctx.strokeStyle = escuro ? `rgba(235,240,255,${alfa})` : `rgba(20,20,30,${alfa})`;
      ctx.beginPath();
      for (let y = 0; y < rows - 1; y++)
        for (let x = 0; x < cols - 1; x++) {
          const a = v[y * cols + x], b = v[y * cols + x + 1], c = v[(y + 1) * cols + x + 1], d = v[(y + 1) * cols + x];
          const caso = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          const seg = SEGMENTOS[caso];
          if (!seg) continue;
          const x0 = x * s, y0 = y * s;
          const borda = [
            [x0 + (s * (L - a)) / (b - a), y0],
            [x0 + s, y0 + (s * (L - b)) / (c - b)],
            [x0 + (s * (L - d)) / (c - d), y0 + s],
            [x0, y0 + (s * (L - a)) / (d - a)],
          ];
          for (let k = 0; k < seg.length; k += 2) {
            const p1 = borda[seg[k]], p2 = borda[seg[k + 1]];
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
          }
        }
      ctx.stroke();
    }
  }
}
