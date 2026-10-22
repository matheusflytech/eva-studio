import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { adicionarDominio, estadoDoEmail, removerDominio, salvarRemetente, verificarDominio } from "@/lib/server/email/dominio";

// Domínio e remetente de e-mail do contrato (Integrações → E-mail).
// GET    estado (configurado, disponível, domínio com registros DNS)
// POST   { dominio } adiciona; { acao: "verificar" } pede a verificação
// PATCH  { remetenteNome, remetenteLocal, responderPara }
// DELETE remove o domínio

const tabelaAusente = () =>
  NextResponse.json({ error: "O e-mail ainda não foi ativado no banco deste ambiente (SQL 2026-10-22-email.sql)." }, { status: 409 });

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await estadoDoEmail(ctx.orgId));
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  try {
    const r = body?.acao === "verificar" ? await verificarDominio(ctx.orgId) : await adicionarDominio(ctx.orgId, String(body?.dominio ?? ""));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ dominio: r.dominio });
  } catch {
    return tabelaAusente();
  }
}

export async function PATCH(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  try {
    const r = await salvarRemetente(ctx.orgId, body ?? {});
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ dominio: r.dominio });
  } catch {
    return tabelaAusente();
  }
}

export async function DELETE() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const r = await removerDominio(ctx.orgId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch {
    return tabelaAusente();
  }
}
