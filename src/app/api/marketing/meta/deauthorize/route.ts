import { NextResponse } from "next/server";
import { metaAdsApp, parseSignedRequest, revokeByMetaUser } from "@/lib/server/meta-ads";

// Callback de desautorização (painel do app da Meta): a pessoa tirou o app da
// conta dela. Apaga o token das conexões dessa pessoa. Público, assinado pela Meta.
export async function POST(request: Request) {
  const app = metaAdsApp();
  const form = await request.formData().catch(() => null);
  const data = app ? parseSignedRequest(form?.get("signed_request")?.toString(), app.appSecret) : null;
  if (!data) return NextResponse.json({ error: "signed_request inválido." }, { status: 400 });
  await revokeByMetaUser(data.user_id);
  return NextResponse.json({ ok: true });
}
