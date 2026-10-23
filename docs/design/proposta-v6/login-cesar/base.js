// Base comum das propostas de login com Júlio César.
// - carregarBusto: lê a foto (cesar.js) como grade de brilho 0..1.
// - Ponteiro: posição do cursor relativa a um elemento, com suavização.
// - CALMO: "reduzir movimento" ligado → mesmo desenho, movimento mais lento
//   (regra do app: calmo, nunca parado).

window.CALMO = matchMedia("(prefers-reduced-motion: reduce)").matches;

window.carregarBusto = (src, largura) =>
  new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const altura = Math.round((largura * img.height) / img.width);
      const c = document.createElement("canvas");
      c.width = largura;
      c.height = altura;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, largura, altura);
      const d = g.getImageData(0, 0, largura, altura).data;
      const v = new Float32Array(largura * altura);
      for (let i = 0; i < v.length; i++) v[i] = d[i * 4] / 255;
      ok({ w: largura, h: altura, v, em: (x, y) => v[Math.min(altura - 1, Math.max(0, y | 0)) * largura + Math.min(largura - 1, Math.max(0, x | 0))] });
    };
    img.src = src;
  });

/** Cursor relativo ao elemento; `x`/`y` seguem o real com atraso (mais "peso"). */
window.Ponteiro = class {
  constructor(el) {
    this.el = el;
    this.rx = this.x = -9999;
    this.ry = this.y = -9999;
    this.dentro = false;
    this.forca = 0; // 0..1, sobe quando entra e desce quando sai
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      this.rx = e.clientX - r.left;
      this.ry = e.clientY - r.top;
      if (!this.dentro) { this.x = this.rx; this.y = this.ry; }
      this.dentro = true;
    });
    el.addEventListener("pointerleave", () => (this.dentro = false));
  }
  passo(suave = 0.18) {
    this.x += (this.rx - this.x) * suave;
    this.y += (this.ry - this.y) * suave;
    this.forca += ((this.dentro ? 1 : 0) - this.forca) * 0.08;
  }
};

/** Canvas nítido em telas retina, redimensiona junto com o elemento. */
window.prepararCanvas = (canvas, aoMudar) => {
  const ajustar = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    aoMudar?.(r.width, r.height, g);
  };
  new ResizeObserver(ajustar).observe(canvas);
  ajustar();
  return canvas.getContext("2d");
};

window.semente = (s) => () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
