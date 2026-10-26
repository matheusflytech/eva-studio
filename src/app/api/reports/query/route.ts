import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { rodarReportQuery } from "@/lib/server/report-sql";
import { sanearReportQuery } from "@/lib/report-query";
import { sanearFiltrosGlobais } from "@/lib/consulta";

// Roda um cartão do construtor (v2). POST porque a consulta é um objeto.
// `globals` são os filtros da barra do painel (dias/de/ate), usados pelo
// filtro de data "no período do painel".
export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const query = sanearReportQuery(body?.query);
  if (!query) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  const globais = sanearFiltrosGlobais(body?.globals && typeof body.globals === "object" ? body.globals : {});

  try {
    const result = await rodarReportQuery(ctx.orgId, query, globais);
    if (!result) return NextResponse.json({ error: "Escolha pelo menos um campo." }, { status: 400 });
    return NextResponse.json({ result });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("statement timeout")) {
      return NextResponse.json({ error: "A consulta demorou demais. Filtre um período menor." }, { status: 504 });
    }
    console.error("[reports/query]", err);
    return NextResponse.json({ error: "Não foi possível calcular este cartão." }, { status: 500 });
  }
}
