import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { erro } from "@/lib/server/api-validacao";
import { converterLeadEmNegocio, resolverIdDoLead } from "@/lib/server/leads";

// Lead vira negócio (primeira etapa aberta do funil padrão, ligado ao contato) e o lead sai da
// fila de trabalho ("Virou negócio"). Precisa poder criar negócio e editar contato.
// 409: o lead já tem um negócio aberto; `dealId` leva a pessoa até ele.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const criar = await requirePermission("negocios:criar");
  if ("error" in criar) return erro(criar.error, criar.status);
  const editar = await requirePermission("contacts:manage");
  if ("error" in editar) return erro(editar.error, editar.status);

  const { id } = await params;
  const contactId = await resolverIdDoLead(criar.orgId, id);
  if (!contactId) return erro("Lead não encontrado.", 404);

  const r = await converterLeadEmNegocio(criar.orgId, contactId, { userId: criar.userId });
  if ("error" in r) return NextResponse.json({ error: r.error, ...(r.dealId ? { dealId: r.dealId } : {}) }, { status: r.status });
  return NextResponse.json({ ok: true, dealId: r.dealId }, { status: 201 });
}
