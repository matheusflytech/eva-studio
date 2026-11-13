// Validação do modelo de disparo (texto, até 3 opções, arquivo opcional).
// Puro: a rota usa para criar e editar.

export const TIPOS_DE_ARQUIVO = new Set(["image", "video", "document"]);
export const MAX_OPCOES = 3;

export interface ModeloDeDisparo {
  name: string;
  text: string;
  options: string[];
  mediaPath: string | null;
  mediaType: string | null;
  mediaMime: string | null;
  mediaName: string | null;
}

export function lerModelo(
  corpo: unknown,
  caminhoValido: (path: string) => boolean
): { ok: true; modelo: ModeloDeDisparo } | { ok: false; erro: string } {
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 120);
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!name) return { ok: false, erro: "Dê um nome ao modelo." };
  const options = (Array.isArray(b.options) ? b.options : [])
    .map((o) => String(o ?? "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_OPCOES);

  const m = b.media && typeof b.media === "object" ? (b.media as Record<string, unknown>) : null;
  if (m) {
    const path = String(m.path ?? "");
    const type = String(m.type ?? "");
    if (!caminhoValido(path) || !TIPOS_DE_ARQUIVO.has(type)) return { ok: false, erro: "Arquivo inválido." };
    if (!text && !path) return { ok: false, erro: "Escreva o texto ou escolha um arquivo." };
    return {
      ok: true,
      modelo: { name, text, options, mediaPath: path, mediaType: type, mediaMime: String(m.mime ?? "").slice(0, 120) || null, mediaName: String(m.name ?? "").slice(0, 200) || null },
    };
  }
  if (!text) return { ok: false, erro: "Escreva o texto do modelo." };
  return { ok: true, modelo: { name, text, options, mediaPath: null, mediaType: null, mediaMime: null, mediaName: null } };
}
