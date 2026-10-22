import { rotaV1 } from "@/lib/server/api-v1/rota";
import { restaurarPelaApi } from "@/lib/server/api-v1/lixeira";

// POST /api/v1/deals/{id}/restore — traz de volta da lixeira (30 dias), com o mesmo id.
export const POST = rotaV1<{ id: string }>({ recurso: "deals", idempotencia: "nao" }, async (ctx, { id }) =>
  restaurarPelaApi(ctx.orgId, "deal", id)
);
