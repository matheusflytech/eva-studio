import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { erro, lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { listarLeads, salvarLeadExterno } from "@/lib/server/leads";

// Leads = contatos com etapa (leadStage), de qualquer canal — ver
// src/lib/server/leads.ts. Antes da Fase 2 eram as conversas do canal
// "website"; a resposta agora é o LeadDto (fields/stage/channel/...).
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return erro(ctx.error, ctx.status);
  return NextResponse.json({ leads: await listarLeads(ctx.orgId) });
}

// Duas formas de entrar: (1) sessão — botão "+ Novo lead" da tela (exige
// contacts:manage); (2) header X-Internal-Secret (n8n, formulário externo),
// mesmo segredo do worker do WhatsApp. No segundo caso a org vem do agente.
//
// Corpo: { agentId, fields | variables, stage | leadStage }. `variables` e
// `leadStage` são os nomes antigos, aceitos como apelido. `contactId`
// (identificador externo, formato antigo) é aceito mas ignorado.
export async function POST(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  const viaSecret = !!expected && timingSafeEqualStr(request.headers.get("x-internal-secret"), expected);

  let orgId: string | null = null;
  if (!viaSecret) {
    const ctx = await requirePermission("contacts:manage");
    if ("error" in ctx) return erro(ctx.error, ctx.status);
    orgId = ctx.orgId;
  }

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  if (body.contactId !== undefined && body.contactId !== null && typeof body.contactId !== "string") {
    return erro("contactId precisa ser texto.");
  }
  const fields = body.fields ?? body.variables;
  const stageBruto = body.stage ?? body.leadStage;
  const stage = stageBruto === "" || stageBruto === null ? undefined : stageBruto;

  if (typeof body.agentId !== "string" || !body.agentId.trim()) return erro("agentId é obrigatório.");

  if (viaSecret) {
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId }, select: { orgId: true } });
    if (!agent) return erro("Agente não encontrado.", 404);
    orgId = agent.orgId;
  }

  const r = await salvarLeadExterno(orgId!, { agentId: body.agentId, fields, stage }, viaSecret ? "api" : "manual");
  if ("error" in r) {
    return NextResponse.json({ error: r.error, ...(r.fieldErrors ? { fieldErrors: r.fieldErrors } : {}) }, { status: r.status });
  }
  return NextResponse.json({ id: r.contactId });
}
