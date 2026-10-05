import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { classificarMime, MAX_MEDIA_BYTES, novoCaminho, urlDeUpload } from "@/lib/server/storage";

// Autoriza um upload de anexo e devolve a URL pra enviar o arquivo direto ao
// storage. O arquivo NÃO passa por aqui: a Vercel recusa corpo acima de 4,5 MB,
// e um PDF de proposta passa disso fácil.
//
// POST { name, mime, size } -> { path, uploadUrl, token, type }
//
// Depois do upload, quem chama usa `path` na resposta (`attachment`).
export async function POST(request: Request) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  // 30 uploads por minuto por usuário: sobra pra quem trabalha, e impede que
  // uma aba travada encha o storage.
  const limite = await checkRateLimit(`upload:${ctx.userId}`, 30, 60);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitos envios seguidos. Espere um instante." }, { status: 429 });
  }

  const { name, mime, size } = await request.json().catch(() => ({}));
  if (typeof mime !== "string" || typeof size !== "number") {
    return NextResponse.json({ error: "Informe o tipo e o tamanho do arquivo." }, { status: 400 });
  }
  if (size <= 0 || size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "O arquivo precisa ter até 16 MB." }, { status: 400 });
  }

  const classe = classificarMime(mime);
  if (!classe) {
    return NextResponse.json(
      { error: "Este tipo de arquivo não é aceito. Use imagem, áudio, vídeo, PDF ou documento do Office." },
      { status: 400 }
    );
  }

  const path = novoCaminho(ctx.orgId, classe.ext);
  const upload = await urlDeUpload(path);
  if (!upload) {
    return NextResponse.json({ error: "Não foi possível preparar o envio. Tente de novo." }, { status: 502 });
  }

  return NextResponse.json({
    path,
    type: classe.tipo,
    mime,
    name: typeof name === "string" ? name.slice(0, 200) : undefined,
    uploadUrl: upload.url,
    token: upload.token,
  });
}
