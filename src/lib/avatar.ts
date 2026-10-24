// Foto de contatos e da equipe. O arquivo mora no bucket público
// "eva-avatares" (caminho com UUID: não dá para adivinhar), e as APIs
// devolvem só o caminho (`avatarPath`); a URL sai daqui, no servidor ou no
// navegador.

export const BUCKET_DE_AVATARES = "eva-avatares";

/** 2 MB: a foto chega reduzida (256 px, WebP) do navegador; isto é só o teto. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const EXTENSAO_DO_AVATAR: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** URL pública da foto, ou null (sem foto, ou storage não configurado). */
export function urlDoAvatar(caminho: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!caminho || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_DE_AVATARES}/${caminho}`;
}
