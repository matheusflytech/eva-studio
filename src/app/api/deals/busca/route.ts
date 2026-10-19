import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { erro, JSON_INVALIDO, lerCorpo } from "@/lib/server/api-validacao";
import { comBusca, listarNegocios } from "@/lib/server/listas-crm";
import type { FiltroDeConsulta } from "@/lib/consulta";

// POST /api/deals/busca — lista paginada de negócios (a visão "lista").
//   { filtro?, q?, pipeline?, arquivados?, sort?, dir?, page?, pageSize? }
// `pipeline` é atalho para "Funil é X". sort: nome, valor, etapa, responsavel,
// criadoEm, previsao, fechadoEm, diasNaEtapa. pageSize 25/50/100 (senão 25).
// Resposta: { total, page, pageSize, deals, somaCents, avisos, truncado, ordenacao }.
export async function POST(request: Request) {
  const ctx = await requirePermission("negocios:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const pipeline = txt(corpo.pipeline);
  const extras: FiltroDeConsulta[] = pipeline ? [{ campo: "funil", op: "qualquer", valores: [pipeline] }] : [];

  const r = await listarNegocios(ctx, {
    filtro: comBusca(corpo.filtro, txt(corpo.q)),
    sort: corpo.sort,
    dir: corpo.dir,
    page: corpo.page,
    pageSize: corpo.pageSize,
    extras,
    incluirArquivados: corpo.arquivados === true,
  });
  return NextResponse.json(r);
}
