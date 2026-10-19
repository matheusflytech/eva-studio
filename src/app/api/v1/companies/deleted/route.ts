import { rotaV1 } from "@/lib/server/api-v1/rota";
import { respostaDeExcluidos } from "@/lib/server/api-v1/externos";

// GET /api/v1/companies/deleted?since= — empresas apagadas (id e external_id).
export const GET = rotaV1({ recurso: "companies" }, async (ctx) => respostaDeExcluidos(ctx.orgId, "company", ctx.url));
