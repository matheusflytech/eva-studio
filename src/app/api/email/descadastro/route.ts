import { NextResponse } from "next/server";
import { lerTokenDeDescadastro, linkDaPaginaDeDescadastro } from "@/lib/server/email/descadastro";
import { suprimirEmail } from "@/lib/server/email/envio";

// Descadastro de e-mail.
// POST = um clique (List-Unsubscribe-Post, RFC 8058): Gmail e Outlook chamam
//        direto, sem a pessoa abrir página; a página de confirmação também.
// GET  = quem abre o link do cabeçalho no navegador vai para a página.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const quem = lerTokenDeDescadastro(token);
  if (!quem) return NextResponse.json({ error: "Link de descadastro inválido." }, { status: 400 });
  try {
    await suprimirEmail(quem.orgId, quem.email, "descadastro");
  } catch {
    return NextResponse.json({ error: "Não deu para registrar agora. Tente de novo em instantes." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, email: quem.email });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(linkDaPaginaDeDescadastro(token));
}
