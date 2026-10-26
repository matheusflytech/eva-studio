import "server-only";
import { NextResponse } from "next/server";
import { autenticarChave } from "@/lib/server/api-keys";
import { escopoPermite } from "@/lib/server/api-v1/escopos";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { ErroLead } from "@/lib/server/leads";
import { idCurto, mesmoContrato } from "@/lib/contrato/rotas";

/** Chave de API (escopo contacts, do contrato da URL) + limite de 120 req/min por org. Devolve o orgId ou a resposta de erro. */
export async function autenticarApiV1(request: Request, contrato: string): Promise<{ orgId: string } | { resposta: NextResponse }> {
  const chave = await autenticarChave(request);
  if (!chave) return { resposta: NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 }) };
  if (!mesmoContrato(chave.orgId, contrato)) {
    return { resposta: NextResponse.json({ error: `Esta chave é do contrato ${idCurto(chave.orgId)}. Use /api/v1/${idCurto(chave.orgId)}/leads.` }, { status: 403 }) };
  }
  // Lead é contato: mesma regra de escopo do /v1/contacts.
  const acao = request.method === "GET" ? "read" : "write";
  if (!escopoPermite(chave.scopes, "contacts", acao)) {
    return { resposta: NextResponse.json({ error: `Esta chave não tem o escopo contacts:${acao}.` }, { status: 403 }) };
  }
  const orgId = chave.orgId;

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) {
    return { resposta: NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 }) };
  }
  return { orgId };
}

export function respostaDeErroDoLead(r: ErroLead) {
  return NextResponse.json({ error: r.error, ...(r.fieldErrors ? { fieldErrors: r.fieldErrors } : {}) }, { status: r.status });
}
