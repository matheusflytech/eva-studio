/* Fundo vivo do EvaApp: curvas de nível que fluem devagar e reagem às ações
   (pulso), e a esfera de partículas da Eva. Canvas 2D, sem bibliotecas.
   Só desenha o que está na tela; com "reduzir movimento" fica parado. */
window.EVAFUNDO = (function () {
  var REDUZ = false; try { REDUZ = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // ---- ruído de valor 3D ----
  var P = new Uint8Array(512), i;
  var semente = 1337; function rnd() { semente = (semente * 16807) % 2147483647; return semente / 2147483647; }
  for (i = 0; i < 256; i++) P[i] = i;
  for (i = 255; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = P[i]; P[i] = P[j]; P[j] = t; }
  for (i = 0; i < 256; i++) P[i + 256] = P[i];
  function h(x, y, z) { return P[P[P[x & 255] + (y & 255)] + (z & 255)] / 255; }
  function sm(t) { return t * t * (3 - 2 * t); }
  function ruido(x, y, z) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
    var a = h(X, Y, Z), b = h(X + 1, Y, Z), c = h(X, Y + 1, Z), d = h(X + 1, Y + 1, Z);
    var e = h(X, Y, Z + 1), f = h(X + 1, Y, Z + 1), g = h(X, Y + 1, Z + 1), k = h(X + 1, Y + 1, Z + 1);
    var l1 = a + (b - a) * fx, l2 = c + (d - c) * fx, l3 = e + (f - e) * fx, l4 = g + (k - g) * fx;
    var m1 = l1 + (l2 - l1) * fy, m2 = l3 + (l4 - l3) * fy;
    return m1 + (m2 - m1) * fz;
  }
  function fbm(x, y, z) { return ruido(x, y, z) * 0.62 + ruido(x * 2.1, y * 2.1, z * 1.3) * 0.28 + ruido(x * 4.3, y * 4.3, z) * 0.10; }

  var campos = [];
  function Campo(cv, op) {
    this.cv = cv; this.cx = cv.getContext("2d"); op = op || {};
    this.forca = op.forca || 1; this.niveis = op.niveis || 16; this.escala = op.escala || 0.0042; this.passo = op.passo || 9;
    this.t = rnd() * 50; this.vel = op.vel || 0.045; this.pulsos = []; this.visivel = false; this.agito = 0;
    this.tom = op.tom || null; this.ultimo = 0;
  }
  Campo.prototype.medir = function () {
    var w = this.cv.offsetWidth, hh = this.cv.offsetHeight; if (!w || !hh) return false;
    var res = 0.75; if (this.cv.width !== Math.round(w * res)) { this.cv.width = Math.round(w * res); this.cv.height = Math.round(hh * res); }
    this.res = res; return true;
  };
  Campo.prototype.pulso = function (x, y, forca) { this.pulsos.push({ x: x, y: y, a: forca || 1, r: 0 }); this.agito = Math.min(1.6, this.agito + (forca || 1) * 0.6); };
  Campo.prototype.desenhar = function (dt) {
    if (!this.medir()) return;
    var cx = this.cx, W = this.cv.width, H = this.cv.height, s = this.passo, cols = Math.ceil(W / s) + 1, rows = Math.ceil(H / s) + 1;
    this.t += dt * this.vel * (1 + this.agito * 2.2); this.agito *= Math.pow(0.35, dt);
    var esc = this.escala / this.res, t = this.t, v = new Float32Array(cols * rows), ps = this.pulsos, r = this.res;
    for (var q = ps.length - 1; q >= 0; q--) { ps[q].r += dt * 420 * r; ps[q].a *= Math.pow(0.42, dt); if (ps[q].a < 0.02) ps.splice(q, 1); }
    for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) {
      var px = xx * s, py = yy * s, val = fbm(px * esc, py * esc, t);
      for (q = 0; q < ps.length; q++) { var dx = px - ps[q].x * r, dy = py - ps[q].y * r, d = Math.sqrt(dx * dx + dy * dy) - ps[q].r; val += ps[q].a * 0.16 * Math.exp(-(d * d) / (2600 * r * r)); }
      v[yy * cols + xx] = val;
    }
    var modo = this.tom || (this.cv.closest('[data-modo="light"]') ? "light" : "dark");
    cx.clearRect(0, 0, W, H);
    cx.lineWidth = 1; cx.lineJoin = "round";
    var N = this.niveis;
    for (var n = 1; n < N; n++) {
      var L = 0.18 + (n / N) * 0.62, forte = n % 4 === 0;
      var alfa = (modo === "light" ? 0.06 : 0.075) * this.forca * (forte ? 1.7 : 1);
      cx.strokeStyle = modo === "light" ? "rgba(20,20,30," + alfa + ")" : "rgba(235,240,255," + alfa + ")";
      cx.beginPath();
      for (yy = 0; yy < rows - 1; yy++) for (xx = 0; xx < cols - 1; xx++) {
        var a = v[yy * cols + xx], b = v[yy * cols + xx + 1], c = v[(yy + 1) * cols + xx + 1], d2 = v[(yy + 1) * cols + xx];
        var idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d2 > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        var x0 = xx * s, y0 = yy * s;
        var T = [x0 + s * (L - a) / (b - a), y0], R = [x0 + s, y0 + s * (L - b) / (c - b)], B = [x0 + s * (L - d2) / (c - d2), y0 + s], E = [x0, y0 + s * (L - a) / (d2 - a)];
        var seg = SEGS[idx];
        for (var z = 0; z < seg.length; z += 2) { var p1 = [T, R, B, E][seg[z]], p2 = [T, R, B, E][seg[z + 1]]; cx.moveTo(p1[0], p1[1]); cx.lineTo(p2[0], p2[1]); }
      }
      cx.stroke();
    }
  };
  var SEGS = { 1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [0, 1], 5: [3, 0, 2, 1], 6: [0, 2], 7: [3, 0], 8: [3, 0], 9: [0, 2], 10: [0, 1, 3, 2], 11: [0, 1], 12: [3, 1], 13: [2, 1], 14: [3, 2] };

  // ---- esfera de partículas (presença da Eva) ----
  var orbes = [];
  function Orbe(cv, op) {
    this.cv = cv; this.cx = cv.getContext("2d"); op = op || {}; this.n = op.n || 1300; this.t = 0; this.voz = 0; this.visivel = false;
    this.pts = []; var g = Math.PI * (3 - Math.sqrt(5));
    for (var k = 0; k < this.n; k++) { var y = 1 - (k / (this.n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = g * k; this.pts.push([Math.cos(th) * rr, y, Math.sin(th) * rr]); }
  }
  Orbe.prototype.fala = function (ms) { var o = this; o.voz = 1; clearTimeout(o._v); o._v = setTimeout(function () { o.voz = 0; }, ms || 1800); };
  Orbe.prototype.desenhar = function (dt) {
    var w = this.cv.offsetWidth, hh = this.cv.offsetHeight; if (!w) return;
    var dpr = 1.5; if (this.cv.width !== Math.round(w * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(hh * dpr); }
    var cx = this.cx, W = this.cv.width, H = this.cv.height, R = Math.min(W, H) * 0.4;
    this.t += dt; this.amp = (this.amp || 0) + ((this.voz ? 1 : 0) - (this.amp || 0)) * Math.min(1, dt * 3);
    cx.clearRect(0, 0, W, H);
    var rot = this.t * 0.25, cr = Math.cos(rot), sr = Math.sin(rot), t = this.t, amp = 0.07 + this.amp * 0.16;
    for (var k = 0; k < this.n; k++) {
      var p = this.pts[k], x = p[0] * cr - p[2] * sr, z = p[0] * sr + p[2] * cr, y = p[1];
      var d = 1 + amp * (ruido(p[0] * 2 + 9, p[1] * 2 + t * 0.6, p[2] * 2 + t * 0.4) - 0.5) * 2;
      var X = x * d, Y = y * d, Z = z * d, pz = 2.6 / (2.6 + Z);
      var sx = W / 2 + X * R * pz, sy = H / 2 + Y * R * pz;
      var frente = (1 - Z) / 2, borda = Math.pow(1 - Math.abs(Z), 0.7);
      var lat = (Y + 1) / 2;
      var cor = lat < 0.5 ? [120 + lat * 160, 180 - lat * 60, 255] : [210 + (lat - 0.5) * 90, 150 - (lat - 0.5) * 80, 255 - (lat - 0.5) * 200];
      var a = (0.35 + borda * 0.65) * (0.5 + frente * 0.5);
      cx.fillStyle = "rgba(" + (cor[0] | 0) + "," + (cor[1] | 0) + "," + (cor[2] | 0) + "," + a.toFixed(3) + ")";
      var sz = (1.2 + borda * 1.5) * pz * dpr;
      cx.fillRect(sx, sy, sz, sz);
    }
  };

  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.target._f) e.target._f.visivel = e.isIntersecting; }); }) : null;
  function registrar(obj) { obj.cv._f = obj; if (io) io.observe(obj.cv); else obj.visivel = true; }
  var t0 = performance.now(), acum = 0;
  function laco(t) {
    var dt = Math.min(0.1, (t - t0) / 1000); t0 = t; acum += dt;
    if (acum > 1 / 30) {
      var passo = REDUZ ? 0 : acum; acum = 0;
      campos = campos.filter(function (c) { return c.cv.isConnected; }); orbes = orbes.filter(function (o) { return o.cv.isConnected; });
      campos.forEach(function (c) { if (c.visivel) c.desenhar(passo); });
      orbes.forEach(function (o) { if (o.visivel) o.desenhar(passo); });
    }
    requestAnimationFrame(laco);
  }
  requestAnimationFrame(laco);
  return {
    campo: function (cv, op) { var c = new Campo(cv, op); campos.push(c); registrar(c); c.desenhar(0); return c; },
    orbe: function (cv, op) { var o = new Orbe(cv, op); orbes.push(o); registrar(o); o.desenhar(0); return o; },
    iniciar: function (raiz) {
      (raiz || document).querySelectorAll("canvas[data-fundo]").forEach(function (cv) { if (!cv._f) EVAFUNDO.campo(cv, { forca: +(cv.dataset.forca || 1), niveis: +(cv.dataset.niveis || 16), tom: cv.dataset.tom || null }); });
      (raiz || document).querySelectorAll("canvas[data-orbe]").forEach(function (cv) { if (!cv._f) EVAFUNDO.orbe(cv); });
    }
  };
})();
