import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { prepararUpload } from "@/lib/server/storage";

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

  const r = await prepararUpload(ctx.orgId, await request.json().catch(() => ({})));
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json(r);
}
