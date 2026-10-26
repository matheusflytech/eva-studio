import { rotaV1 } from "@/lib/server/api-v1/rota";
import { respostaDeExcluidos } from "@/lib/server/api-v1/externos";

// GET /api/v1/contacts/deleted?since= — contatos apagados (id e data).
export const GET = rotaV1({ recurso: "contacts" }, async (ctx) => respostaDeExcluidos(ctx.orgId, "contact", ctx.url));
