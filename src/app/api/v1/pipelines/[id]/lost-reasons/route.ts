import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { funilDoCaminho } from "@/lib/server/api-v1/funis";
import { lerMotivos } from "@/lib/server/regras-de-etapa";
import { lostReasonIdToPublic } from "@/lib/server/api-v1/public-values";

type P = { id: string };

// GET /api/v1/pipelines/{id}/lost-reasons — motivos de perda do funil, na
// ordem da tela. O id é o que vai em lost_reason_id (/deals/{id}/lost e /move).
// Funil sem motivos salvos usa os padrão (ids "padrao:...").
export const GET = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const { motivos } = await lerMotivos(funil.id);
  const data = motivos.map((m) => ({ id: lostReasonIdToPublic(m.id), label: m.rotulo, requires_note: m.exigeNota }));
  return NextResponse.json(corpoDeLista(data, { hasMore: false, nextCursor: null }));
});
