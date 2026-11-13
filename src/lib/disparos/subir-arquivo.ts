// Sobe um arquivo do navegador direto para o storage (URL assinada de
// /api/conversations/upload) e devolve o que o disparo/modelo guarda.
// Não passa pelo servidor do app: a Vercel recusa corpo acima de 4,5 MB.

export interface ArquivoEnviado {
  path: string;
  type: string;
  mime: string;
  name: string;
}

export async function subirArquivo(file: File): Promise<ArquivoEnviado> {
  const r = await fetch("/api/conversations/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
  });
  const auth = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(auth.error ?? "Não foi possível enviar o arquivo.");
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const up = await fetch(auth.uploadUrl, { method: "PUT", body: form });
  if (!up.ok) throw new Error("O envio do arquivo falhou.");
  return { path: auth.path, type: auth.type, mime: file.type, name: file.name };
}
