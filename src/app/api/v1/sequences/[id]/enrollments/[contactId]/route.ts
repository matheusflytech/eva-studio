import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { carregarSequencia } from "@/lib/server/api-v1/sequencias";

// DELETE /api/v1/sequences/{id}/enrollments/{contactId} — tira o contato da régua
// (fica registrado como stopped/manual, igual a parar pela tela).
export const DELETE = rotaV1<{ id: string; contactId: string }>({ recurso: "sequences" }, async (ctx, { id, contactId }) => {
  await carregarSequencia(ctx.orgId, id);
  const r = await prisma.sequenceEnrollment.updateMany({
    where: { sequenceId: id, contactId, status: "active" },
    data: { status: "stopped", stoppedReason: "manual" },
  });
  if (r.count === 0) throw new ErroApi(404, "not_found", "Este contato não está ativo nesta sequência.");
  return NextResponse.json({ data: { sequence_id: id, contact_id: contactId, status: "stopped" } });
});
