import { NextResponse } from "next/server";
import { LEAD_STAGE, fromPublic } from "@/lib/server/api-v1/public-values";
import { erro, lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { buscarLead, isLeadStage, LEAD_STAGES, listarLeads, salvarLeadExterno, serializarLeadPublico } from "@/lib/server/leads";
import { autenticarApiV1, respostaDeErroDoLead } from "./auth";

// API pública de Leads — /api/v1/leads. Autenticada por "Authorization: Bearer
// evs_live_...", uma chave por org (ver Integrações → API). Mesmo dado que a
// tela de Leads mostra: contatos com etapa de lead, de qualquer canal (ver
// src/lib/server/leads.ts). Formato da resposta em serializarLeadPublico.

type Params = { params: Promise<{ contract: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await autenticarApiV1(request, (await params).contract);
  if ("resposta" in auth) return auth.resposta;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  // Aceita o nome em inglês (new, contacted...) além do antigo.
  const bruto = searchParams.get("stage");
  const stage = bruto ? (fromPublic(LEAD_STAGE, bruto) ?? bruto) : bruto;
  if (stage && !isLeadStage(stage)) return erro(`stage precisa ser um de: ${LEAD_STAGES.join(", ")}.`);

  const leads = await listarLeads(auth.orgId, { stage, limit });
  return NextResponse.json({ data: leads.map(serializarLeadPublico) });
}

// Corpo: { agentId, fields, stage? }. `variables`/`leadStage` aceitos como
// apelido. `contactId` (formato antigo) é aceito se for texto, mas ignorado:
// o lead é deduplicado por e-mail/telefone.
export async function POST(request: Request, { params }: Params) {
  const auth = await autenticarApiV1(request, (await params).contract);
  if ("resposta" in auth) return auth.resposta;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  if (body.contactId !== undefined && body.contactId !== null && typeof body.contactId !== "string") {
    return erro("contactId precisa ser texto.");
  }
  const fields = body.fields ?? body.variables;
  if (typeof body.agentId !== "string" || !body.agentId.trim() || !fields || typeof fields !== "object" || Array.isArray(fields)) {
    return erro("agentId e fields são obrigatórios.");
  }
  const stageBruto = body.stage ?? body.leadStage;
  const stage = stageBruto === "" || stageBruto === null ? undefined : typeof stageBruto === "string" ? (fromPublic(LEAD_STAGE, stageBruto) ?? stageBruto) : stageBruto;

  const r = await salvarLeadExterno(auth.orgId, { agentId: body.agentId, fields, stage }, "api");
  if ("error" in r) return respostaDeErroDoLead(r);

  const lead = await buscarLead(auth.orgId, r.contactId);
  if (!lead) return erro("Lead não encontrado.", 404);
  return NextResponse.json({ data: serializarLeadPublico(lead) }, { status: 201 });
}
