import { NextResponse } from "next/server";
import { LEAD_STAGE, fromPublic } from "@/lib/server/api-v1/public-values";
import { erro, lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { atualizarLead, buscarLead, removerDosLeads, resolverIdDoLead, serializarLeadPublico } from "@/lib/server/leads";
import { autenticarApiV1, respostaDeErroDoLead } from "../auth";

// `id` é o id do contato. O id antigo (de conversa, devolvido pela API antes
// da Fase 2) continua funcionando: resolve para o contato ligado a ela.
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await autenticarApiV1(request);
  if ("resposta" in auth) return auth.resposta;

  const { id } = await params;
  const contactId = await resolverIdDoLead(auth.orgId, id);
  const lead = contactId ? await buscarLead(auth.orgId, contactId) : null;
  if (!lead) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ data: serializarLeadPublico(lead) });
}

// Corpo: { stage?, fields? } (`leadStage`/`variables` como apelido). `fields`
// é mesclado: nome/e-mail/telefone vão para a ficha, o resto vira campo livre.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await autenticarApiV1(request);
  if ("resposta" in auth) return auth.resposta;

  const { id } = await params;
  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  const contactId = await resolverIdDoLead(auth.orgId, id);
  if (!contactId) return erro("Lead não encontrado.", 404);

  // Aceita o nome em inglês (new, contacted...) além do antigo.
  const stageBruto = body.stage ?? body.leadStage;
  const r = await atualizarLead(auth.orgId, contactId, {
    stage: typeof stageBruto === "string" ? (fromPublic(LEAD_STAGE, stageBruto) ?? stageBruto) : stageBruto,
    fields: body.fields ?? body.variables,
  });
  if ("error" in r) return respostaDeErroDoLead(r);

  const lead = await buscarLead(auth.orgId, r.contactId);
  if (!lead) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ data: serializarLeadPublico(lead) });
}

// Tira da lista de leads; o contato e as conversas continuam. `deleted` fica
// por compatibilidade com quem já tratava a resposta antiga.
export async function DELETE(request: Request, { params }: Params) {
  const auth = await autenticarApiV1(request);
  if ("resposta" in auth) return auth.resposta;

  const { id } = await params;
  const contactId = await resolverIdDoLead(auth.orgId, id);
  if (!contactId || !(await removerDosLeads(auth.orgId, contactId))) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ data: { deleted: true, removed: true } });
}
