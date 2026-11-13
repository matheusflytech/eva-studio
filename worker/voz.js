// Áudio do atendente sai como NOTA DE VOZ (a bolinha azul "gravado agora"),
// não como arquivo de áudio anexado.
//
// O WhatsApp só toca nota de voz em ogg/opus. O navegador grava m4a (Safari) ou
// webm (Chrome); esses passam pelo ffmpeg. Se a conversão falhar, vai o arquivo
// original marcado como voz (aparece como voz; em alguns aparelhos pode não tocar).
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export const MIME_DE_VOZ = "audio/ogg; codecs=opus";

/** Já é ogg/opus? Aí não precisa converter. */
export function jaEhVoz(mime) {
  return /^audio\/ogg/i.test(String(mime ?? ""));
}

/** Converte qualquer áudio em ogg/opus mono 48 kHz (o que o WhatsApp grava). */
export function paraOggOpus(entrada, caminho = ffmpegPath) {
  return new Promise((resolve, reject) => {
    if (!caminho) return reject(new Error("ffmpeg indisponível"));
    const p = spawn(caminho, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"]);
    const saida = [];
    let erro = "";
    p.stdout.on("data", (b) => saida.push(b));
    p.stderr.on("data", (b) => (erro += b));
    p.on("error", reject);
    p.on("close", (codigo) => (codigo === 0 && saida.length ? resolve(Buffer.concat(saida)) : reject(new Error(erro.trim() || `ffmpeg saiu com ${codigo}`))));
    p.stdin.on("error", () => {});
    p.stdin.end(entrada);
  });
}

/** Conteúdo do Baileys para mandar o áudio da URL como nota de voz. */
export async function conteudoDeVoz(url, mime, { baixar = fetch, converter = paraOggOpus } = {}) {
  if (jaEhVoz(mime)) return { audio: { url }, mimetype: MIME_DE_VOZ, ptt: true };
  try {
    const r = await baixar(url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const ogg = await converter(Buffer.from(await r.arrayBuffer()));
    return { audio: ogg, mimetype: MIME_DE_VOZ, ptt: true };
  } catch {
    return { audio: { url }, mimetype: mime || "audio/mp4", ptt: true };
  }
}
