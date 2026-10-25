import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeFunil, criarFunil, listarFunis } from "@/lib/server/funis-acoes";

// Funis da organização. O GET cria o funil padrão na primeira visita, em vez
// de exigir configuração antes de qualquer coisa funcionar — é o que permite
// o bloco "Criar negócio" do Builder rodar sem ninguém ter configurado nada.
// A regra mora em src/lib/server/funis-acoes.ts (a API v1 usa a mesma).
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const pipelines = await listarFunis(ctx.orgId);

  return NextResponse.json({
    pipelines: pipelines.map((p) => ({
      id: p.id,
      // Número do funil no contrato: é o que vai na URL (?funil=) e na API v1.
      numero: p.numero,
      name: p.name,
      isDefault: p.isDefault,
      dealCount: p._count.deals,
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        type: s.type,
        color: s.color,
        dealCount: s._count.deals,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  try {
    const pipeline = await criarFunil(ctx.orgId, { name: body?.name, stages: body?.stages });
    return NextResponse.json({ pipeline });
  } catch (e) {
    if (e instanceof ErroDeFunil) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    throw e;
  }
}
