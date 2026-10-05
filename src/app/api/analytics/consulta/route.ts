import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { rodarConsulta, listarNegociosDaConsulta } from "@/lib/server/consulta";
import { sanearConsulta } from "@/lib/consulta";

// Calcula um cartão montado pelo cliente. POST porque a consulta é um objeto
// (medida, campo, agrupamento, filtros), não cabe numa query string decente.
// `lista: true` devolve os negócios em vez do número, pro cartão de tabela.
export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const consulta = sanearConsulta(body.consulta);
  if (!consulta) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });

  const dias = Math.min(Math.max(Number(body.dias) || 30, 1), 365);

  try {
    const resultado = body.lista === true ? await listarNegociosDaConsulta(ctx.orgId, consulta, dias) : await rodarConsulta(ctx.orgId, consulta, dias);
    return NextResponse.json({ resultado });
  } catch (err) {
    console.error("[consulta]", err);
    return NextResponse.json({ error: "Não foi possível calcular este cartão." }, { status: 500 });
  }
}
