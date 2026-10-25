import { after, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { receberWebhook } from "@/lib/server/automacoes/webhook-de-entrada";
import { executarExecucao } from "@/lib/server/automacoes/executor";

// ---------------------------------------------------------------------------
// URL do gatilho "Webhook de entrada" de uma automação:
//   POST { "email": "ana@x.com", "phone": "5511...", "name": "Ana", ...qualquer campo }
//   ou   { "id": "<id do registro>" }
// O token na URL é a credencial. O corpo vira {{gatilho.campo}} nos passos.
// Header opcional Idempotency-Key: a mesma chave não inscreve duas vezes.
// ---------------------------------------------------------------------------

const POR_MINUTO = 120;
const MAX_BYTES = 32_000;

export async function POST(request: Request, { params }: { params: Promise<{ automationId: string; token: string }> }) {
  const { automationId, token } = await params;

  const limite = await checkRateLimit(`hook-automacao:${automationId}`, POR_MINUTO, 60);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Muitas chamadas em pouco tempo. Tente de novo em instantes." } },
      { status: 429, headers: { "Retry-After": String(limite.resetSec ?? 60) } }
    );
  }

  const bruto = await request.text().catch(() => "");
  if (bruto.length > MAX_BYTES) return NextResponse.json({ error: { code: "too_large", message: "Corpo maior que 32 KB." } }, { status: 413 });
  let corpo: unknown = {};
  try {
    corpo = bruto.trim() ? JSON.parse(bruto) : {};
  } catch {
    corpo = null;
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ error: { code: "invalid_json", message: "Envie um objeto JSON." } }, { status: 400 });
  }

  const r = await receberWebhook(automationId, token, corpo as Record<string, unknown>, request.headers.get("idempotency-key"));
  // Começa a rodar depois de responder (quem chamou não espera os passos).
  if (r.executar) {
    const id = r.executar;
    after(() => executarExecucao(id).then(() => undefined).catch(() => undefined));
  }
  return NextResponse.json(r.corpo, { status: r.status });
}
