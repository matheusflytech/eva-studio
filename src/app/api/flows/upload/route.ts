import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { prepararUpload } from "@/lib/server/storage";

// Autoriza o upload de uma mídia do Bloco do Studio e devolve a URL para enviar
// o arquivo direto ao storage (privado). O fluxo guarda só o caminho; o motor
// assina o link na hora de mandar.
//
// POST { name, mime, size } -> { path, uploadUrl, token, type }
export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const limite = await checkRateLimit(`upload:${ctx.userId}`, 30, 60);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitos envios seguidos. Espere um instante." }, { status: 429 });
  }

  const r = await prepararUpload(ctx.orgId, await request.json().catch(() => ({})));
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json(r);
}
