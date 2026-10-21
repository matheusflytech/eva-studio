import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta, lerDataDaConsulta, lerLimite } from "@/lib/server/api-v1/paginacao";
import { lerCursor, lerTipos, listarEventos } from "@/lib/server/api-v1/eventos";

// GET /api/v1/events — eventos do CRM por consulta (alternativa ao webhook
// para quem não tem URL pública). ?types=deal.*,task.completed&since=ISO
// (padrão: últimas 24 h; até 30 dias) e depois só ?cursor=next_cursor.
export const GET = rotaV1({ recurso: "webhooks" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, ["types", "since"]);
  const r = await listarEventos(ctx.orgId, {
    tipos: lerTipos(sp.get("types")),
    desde: lerDataDaConsulta(sp, "since"),
    cursor: lerCursor(sp.get("cursor")),
    limite: lerLimite(sp),
  });
  return NextResponse.json(r);
});
