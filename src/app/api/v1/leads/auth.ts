import "server-only";
import { NextResponse } from "next/server";
import { autenticarChave } from "@/lib/server/api-keys";
import { escopoPermite } from "@/lib/server/api-v1/escopos";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { ErroLead } from "@/lib/server/leads";

/** Chave de API (escopo contacts) + limite de 120 req/min por org. Devolve o orgId ou a resposta de erro. */
export async function autenticarApiV1(request: Request): Promise<{ orgId: string } | { resposta: NextResponse }> {
  const chave = await autenticarChave(request);
  if (!chave) return { resposta: NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 }) };
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
