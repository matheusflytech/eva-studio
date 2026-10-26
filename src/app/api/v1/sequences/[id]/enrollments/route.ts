import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enrollContact } from "@/lib/server/sequences";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, corpoDeLista, iso } from "@/lib/server/api-v1/http";
import { conferirCampos, listaDeIdsOpc } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import { carregarSequencia } from "@/lib/server/api-v1/sequencias";

type P = { id: string };

// GET /api/v1/sequences/{id}/enrollments?status=active|done|stopped
export const GET = rotaV1<P>({ recurso: "sequences" }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url, ["status"]);
  await carregarSequencia(ctx.orgId, id);
  const status = sp.get("status");
  if (status && !["active", "done", "stopped"].includes(status)) {
    throw new ErroApi(400, "invalid_parameter", "status precisa ser active, done ou stopped.", { param: "status" });
  }
  const where = { sequenceId: id, ...(status ? { status } : {}) };
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.sequenceEnrollment.findMany({ where: cursor ? { AND: [where, cursor] } : where, take, orderBy }),
    contar: () => prisma.sequenceEnrollment.count({ where }),
  });
  return NextResponse.json(
    corpoDeLista(
      pagina.itens.map((e) => ({
        id: e.id,
        contact_id: e.contactId,
        status: e.status,
        current_step: e.currentStep,
        stopped_reason: e.stoppedReason,
        next_run_at: iso(e.nextRunAt),
        created_at: iso(e.createdAt),
        updated_at: iso(e.updatedAt),
      })),
      pagina
    )
  );
});

// POST /api/v1/sequences/{id}/enrollments — { contact_ids: [...até 100] }.
// Mesma regra da tela (enrollContact): opt-out não entra, sem reentrada quem já passou.
export const POST = rotaV1<P>({ recurso: "sequences" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["contact_ids"]);
  const ids = listaDeIdsOpc(corpo, "contact_ids", 100);
  if (!ids?.length) throw new ErroApi(400, "invalid_parameter", "contact_ids é obrigatório.", { param: "contact_ids" });
  const seq = await carregarSequencia(ctx.orgId, id);
  if (seq.steps.length === 0) throw new ErroApi(422, "no_steps", "A sequência não tem passos.");
  const daOrg = new Set(
    (await prisma.contact.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true } })).map((c) => c.id)
  );
  const data = [];
  for (const contactId of ids) {
    if (!daOrg.has(contactId)) {
      data.push({ contact_id: contactId, enrolled: false, reason: "not_found" });
      continue;
    }
    const enrollmentId = await enrollContact(id, contactId);
    data.push({ contact_id: contactId, enrolled: !!enrollmentId, ...(enrollmentId ? { enrollment_id: enrollmentId } : { reason: "not_eligible" }) });
  }
  return NextResponse.json({ data });
});
