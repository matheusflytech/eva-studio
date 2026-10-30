import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { metaAdsApp, parseSignedRequest, revokeByMetaUser } from "@/lib/server/meta-ads";

// Callback de exclusão de dados (exigido pela Meta). Da pessoa, a Eva guarda só
// o token da conexão: apaga na hora e devolve o código que a Meta mostra a ela.
// O gasto importado é do contrato (não da pessoa) e sai pelo botão da aba.
export async function POST(request: Request) {
  const app = metaAdsApp();
  const form = await request.formData().catch(() => null);
  const data = app ? parseSignedRequest(form?.get("signed_request")?.toString(), app.appSecret) : null;
  if (!data) return NextResponse.json({ error: "signed_request inválido." }, { status: 400 });
  await revokeByMetaUser(data.user_id);
  const code = crypto.randomBytes(8).toString("hex");
  return NextResponse.json({ url: `${new URL(request.url).origin}/privacy#dados`, confirmation_code: code });
}
