import { rotaV1 } from "@/lib/server/api-v1/rota";
import { respostaDeExcluidos } from "@/lib/server/api-v1/externos";

// GET /api/v1/deals/deleted?since= — negócios apagados (id e data).
export const GET = rotaV1({ recurso: "deals" }, async (ctx) => respostaDeExcluidos(ctx.orgId, "deal", ctx.url));
