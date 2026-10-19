import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { conferirCampos, idOpc, textoOpc } from "@/lib/server/api-v1/entrada";
import { INCLUDE_CONTATO, serializarContatos } from "@/lib/server/api-v1/contatos";
import { carregarNegocio } from "@/lib/server/api-v1/negocios";

type P = { id: string };

// GET /api/v1/deals/{id}/contacts — contatos do negócio, com o papel de cada um.
export const GET = rotaV1<P>({ recurso: "deals" }, async (ctx, { id }) => {
  await carregarNegocio(ctx.orgId, id);
  const vinculos = await prisma.dealContact.findMany({
    where: { dealId: id, contact: { orgId: ctx.orgId } },
    include: { contact: { include: INCLUDE_CONTATO } },
  });
  const contatos = await serializarContatos(ctx.orgId, vinculos.map((v) => v.contact));
  return NextResponse.json({
    data: contatos.map((c, i) => ({ ...c, role: vinculos[i].role })),
    has_more: false,
    next_cursor: null,
  });
});

// POST /api/v1/deals/{id}/contacts — { contact_id, role? }. Repetir só atualiza o papel.
export const POST = rotaV1<P>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["contact_id", "role"]);
  const contactId = idOpc(corpo, "contact_id");
  if (!contactId) throw new ErroApi(400, "invalid_parameter", "contact_id é obrigatório.", { param: "contact_id" });
  await carregarNegocio(ctx.orgId, id);
  const contato = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId }, select: { id: true } });
  if (!contato) throw new ErroApi(404, "invalid_reference", "Contato não encontrado nesta organização.", { param: "contact_id" });
  const role = textoOpc(corpo, "role", 60);
  const v = await prisma.dealContact.upsert({
    where: { dealId_contactId: { dealId: id, contactId } },
    create: { dealId: id, contactId, role: role ?? "" },
    update: role !== undefined ? { role } : {},
  });
  return NextResponse.json({ data: { deal_id: id, contact_id: contactId, role: v.role } }, { status: 201 });
});
