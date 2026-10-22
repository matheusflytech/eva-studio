import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { erro, lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { atualizarLead, buscarLead, removerDosLeads, resolverIdDoLead } from "@/lib/server/leads";

// `id` é o id do contato; id antigo (de conversa, antes da Fase 2) também
// resolve para o contato ligado a ela.
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return erro(ctx.error, ctx.status);
  const { id } = await params;
  const contactId = await resolverIdDoLead(ctx.orgId, id);
  const lead = contactId ? await buscarLead(ctx.orgId, contactId) : null;
  if (!lead) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ lead });
}

// Corpo: { stage | leadStage, fields | variables } — pelo menos um dos dois.
export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return erro(ctx.error, ctx.status);
  const { id } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  const contactId = await resolverIdDoLead(ctx.orgId, id);
  if (!contactId) return erro("Lead não encontrado.", 404);

  const r = await atualizarLead(ctx.orgId, contactId, {
    stage: body.stage ?? body.leadStage,
    fields: body.fields ?? body.variables,
  });
  if ("error" in r) {
    return NextResponse.json({ error: r.error, ...(r.fieldErrors ? { fieldErrors: r.fieldErrors } : {}) }, { status: r.status });
  }
  return NextResponse.json({ ok: true, lead: await buscarLead(ctx.orgId, r.contactId) });
}

// Tira da lista de leads (leadStage = null). O contato, as conversas e os
// negócios continuam — antes isso apagava a conversa inteira.
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return erro(ctx.error, ctx.status);
  const { id } = await params;
  const contactId = await resolverIdDoLead(ctx.orgId, id);
  if (!contactId || !(await removerDosLeads(ctx.orgId, contactId))) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ ok: true });
}
