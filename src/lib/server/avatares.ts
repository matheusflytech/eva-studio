import "server-only";
import { randomUUID } from "node:crypto";
import { BUCKET_DE_AVATARES, EXTENSAO_DO_AVATAR, MAX_AVATAR_BYTES } from "@/lib/avatar";
import { apagarArquivos, midiaExiste, mimeBase, urlDeUpload } from "@/lib/server/storage";

// Upload da foto em dois passos, como os anexos: a rota autoriza e devolve
// uma URL de upload de uso único (o arquivo não passa pela Vercel), e depois
// confirma o caminho. Prefixo por dono: contato em "{orgId}/", pessoa da
// equipe em "pessoas/{userId}/" (a mesma pessoa pode estar em vários contratos).

export type Pedido = { mime?: unknown; size?: unknown };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string; status: number };

export const prefixoDoContato = (orgId: string) => `${orgId}/`;
export const prefixoDaPessoa = (userId: string) => `pessoas/${userId}/`;

/** Confere tipo e tamanho e devolve o caminho novo com a URL de upload. */
export async function autorizarUpload(prefixo: string, pedido: Pedido): Promise<Resultado<{ path: string; uploadUrl: string; token: string }>> {
  const mime = typeof pedido.mime === "string" ? mimeBase(pedido.mime) : "";
  const ext = EXTENSAO_DO_AVATAR[mime];
  if (!ext) return { ok: false, erro: "Use uma imagem JPG, PNG ou WebP.", status: 400 };
  const size = typeof pedido.size === "number" ? pedido.size : 0;
  if (size <= 0 || size > MAX_AVATAR_BYTES) return { ok: false, erro: "A foto precisa ter até 2 MB.", status: 400 };
  const path = `${prefixo}${randomUUID()}.${ext}`;
  const up = await urlDeUpload(path, BUCKET_DE_AVATARES);
  if (!up) return { ok: false, erro: "Não foi possível preparar o envio da foto.", status: 502 };
  return { ok: true, valor: { path, uploadUrl: up.url, token: up.token } };
}

/** O caminho é do dono certo, tem extensão de foto e o arquivo subiu mesmo? */
export async function conferirCaminho(prefixo: string, path: unknown): Promise<Resultado<string>> {
  const ok =
    typeof path === "string" &&
    path.startsWith(prefixo) &&
    !path.includes("..") &&
    /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path.slice(prefixo.length));
  if (!ok) return { ok: false, erro: "Foto inválida.", status: 400 };
  const info = await midiaExiste(path, BUCKET_DE_AVATARES);
  if (!info.existe) return { ok: false, erro: "A foto não chegou. Tente enviar de novo.", status: 400 };
  if (info.tamanho > MAX_AVATAR_BYTES) {
    await apagarArquivos([path], BUCKET_DE_AVATARES);
    return { ok: false, erro: "A foto precisa ter até 2 MB.", status: 400 };
  }
  return { ok: true, valor: path };
}

/** Apaga a foto que saiu (troca ou remoção). */
export async function apagarFoto(path: string | null | undefined): Promise<void> {
  if (path) await apagarArquivos([path], BUCKET_DE_AVATARES);
}
