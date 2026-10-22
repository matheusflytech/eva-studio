import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { lerConexao, salvarConexao } from "@/lib/server/ia/conexao";

// Conexão de IA do contrato (Central de IA): a lista em ordem de preferência
// de chave + modelo que os blocos de IA usam, com reserva automática.
// Só ids e modelos passam por aqui; as chaves ficam cifradas no banco.

export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await lerConexao(ctx.orgId));
}

export async function PUT(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.passos)) {
    return NextResponse.json({ error: "Envie { passos: [{ credentialId, model }], timeoutMs }." }, { status: 400 });
  }

  const atual = await lerConexao(ctx.orgId);
  if (!atual.disponivel) {
    return NextResponse.json(
      { error: "A Central de IA ainda não foi ativada no banco. Peça para aplicarem o SQL 2026-10-21-conexao-ia.sql." },
      { status: 409 }
    );
  }
  return NextResponse.json(await salvarConexao(ctx.orgId, body.passos, body.timeoutMs));
}
