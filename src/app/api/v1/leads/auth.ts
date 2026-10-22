import "server-only";
import { NextResponse } from "next/server";
import { requireApiKeyOrgId } from "@/lib/server/api-keys";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { ErroLead } from "@/lib/server/leads";

/** Chave de API + limite de 120 req/min por org. Devolve o orgId ou a resposta de erro. */
export async function autenticarApiV1(request: Request): Promise<{ orgId: string } | { resposta: NextResponse }> {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return { resposta: NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 }) };

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) {
    return { resposta: NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 }) };
  }
  return { orgId };
}

export function respostaDeErroDoLead(r: ErroLead) {
  return NextResponse.json({ error: r.error, ...(r.fieldErrors ? { fieldErrors: r.fieldErrors } : {}) }, { status: r.status });
}
