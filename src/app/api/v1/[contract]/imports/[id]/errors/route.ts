import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { carregarJob, type ErroDeLinha } from "@/lib/server/api-v1/jobs";
import { lerConsulta, lerLimite } from "@/lib/server/api-v1/paginacao";

// GET /api/v1/imports/{id}/errors — erro por linha (row, code, message, param, record).
// Até 1000 erros guardados por importação; o contador `failed` é sempre exato.
export const GET = rotaV1<{ id: string }>({ recurso: "imports", aceitaTambem: ["write"] }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url);
  const limite = lerLimite(sp);
  const job = await carregarJob(ctx.orgId, id, "import");
  const erros = (Array.isArray(job.errors) ? job.errors : []) as unknown as ErroDeLinha[];
  const bruto = sp.get("cursor");
  const inicio = bruto ? Number(Buffer.from(bruto, "base64url").toString("utf8")) : 0;
  if (!Number.isInteger(inicio) || inicio < 0) throw new ErroApi(400, "invalid_cursor", "Cursor inválido.", { param: "cursor" });
  const fim = inicio + limite;
  const hasMore = fim < erros.length;
  return NextResponse.json({
    data: erros.slice(inicio, fim),
    has_more: hasMore,
    next_cursor: hasMore ? Buffer.from(String(fim)).toString("base64url") : null,
    total: erros.length,
  });
});
