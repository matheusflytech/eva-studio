import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { enviarEmailDoContrato } from "@/lib/server/email/envio";
import { createClient } from "@/lib/supabase/server";

// "Enviar teste para mim": manda o modelo (ou o rascunho da tela) para o
// e-mail de quem está logado, com os dados de exemplo ou de um contato.
export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const meuEmail = data.user?.email;
  if (!meuEmail) return NextResponse.json({ error: "Não achei o seu e-mail de login." }, { status: 400 });

  const conteudo =
    typeof body?.modeloId === "string"
      ? { modeloId: body.modeloId }
      : { assunto: String(body?.assunto ?? ""), corpo: String(body?.corpo ?? ""), modo: body?.modo === "html" ? ("html" as const) : ("simples" as const) };

  const r = await enviarEmailDoContrato(ctx.orgId, {
    email: meuEmail,
    contactId: typeof body?.contactId === "string" ? body.contactId : null,
    conteudo,
    origem: "teste",
  });
  if (!r.ok) return NextResponse.json({ error: r.erro, motivo: r.motivo }, { status: r.motivo === "erro" ? 502 : 400 });
  return NextResponse.json({ ok: true, para: meuEmail });
}
