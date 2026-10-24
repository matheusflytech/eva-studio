import { NextResponse } from "next/server";
import { aceitarConvite, ErroDoConvite } from "@/lib/server/convite";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";

// Aceite do convite para quem já tinha conta (link do e-mail). Público: quem
// prova o e-mail é o link assinado, não uma sessão.
export async function POST(request: Request) {
  const rl = await checkRateLimit(`convite:${getClientIp(request)}`, 10, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const token = typeof body.t === "string" ? body.t : "";
  const senha = typeof body.senha === "string" ? body.senha : "";
  try {
    await aceitarConvite(token, senha);
  } catch (e) {
    if (e instanceof ErroDoConvite) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
