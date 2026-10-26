import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { carregarNegocio } from "@/lib/server/api-v1/negocios";

// DELETE /api/v1/deals/{id}/contacts/{contactId} — desvincula (o contato continua existindo).
export const DELETE = rotaV1<{ id: string; contactId: string }>({ recurso: "deals" }, async (ctx, { id, contactId }) => {
  await carregarNegocio(ctx.orgId, id);
  const r = await prisma.dealContact.deleteMany({ where: { dealId: id, contactId } });
  if (r.count === 0) throw new ErroApi(404, "not_found", "Este contato não está ligado ao negócio.");
  return NextResponse.json({ data: { deal_id: id, contact_id: contactId, removed: true } });
});
