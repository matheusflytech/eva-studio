import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { POST as processarMeta } from "@/app/api/webhooks/meta/route";
import { POST as processarTelegram } from "@/app/api/webhooks/telegram/[agentId]/route";
import { POST as processarTikTok } from "@/app/api/webhooks/tiktok/[agentId]/route";

// ---------------------------------------------------------------------------
// Recebimento interno dos webhooks que entraram pelo Worker da Cloudflare
// (cloudflare/webhook-ingress). O Worker já validou a origem, respondeu 200
// para a Meta/Telegram/TikTok e enfileirou; aqui chega um envelope por vez,
// assinado pelo Worker.
//
// Autenticação: x-eva-signature = "v1=" + HMAC-SHA256(INGRESS_SIGNING_SECRET,
// "{x-eva-timestamp}.{corpo}"), com tolerância de 5 min contra reenvio.
//
// Processamento: chama os MESMOS handlers das rotas /api/webhooks/*, montando
// a requisição como a origem teria mandado. Zero mudança nas rotas atuais —
// elas continuam recebendo direto enquanto a troca não for feita, e a volta
// é só reapontar a URL de callback. A Meta ainda revalida o X-Hub-Signature-256
// original lá dentro (defesa em profundidade); Telegram e TikTok recebem o
// segredo do próprio app, já que a origem foi conferida no Worker.
//
// Status de resposta para o Worker: 2xx = feito; 5xx = tentar de novo;
// 4xx = não adianta repetir (vai para a fila morta).
// ---------------------------------------------------------------------------

const TOLERANCIA_SEGUNDOS = 300;

interface Envelope {
  v: 1;
  id: string;
  origem: "meta" | "telegram" | "tiktok";
  agentId?: string;
  recebidoEm: string;
  corpo: string;
  cabecalhos: { "x-hub-signature-256"?: string };
}

function assinaturaValida(segredo: string, timestamp: string | null, corpo: string, assinatura: string | null): boolean {
  if (!timestamp || !assinatura || !/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCIA_SEGUNDOS) return false;
  const esperado = "v1=" + crypto.createHmac("sha256", segredo).update(`${timestamp}.${corpo}`, "utf8").digest("hex");
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lerEnvelope(corpo: string): Envelope | null {
  try {
    const e = JSON.parse(corpo) as Partial<Envelope>;
    if (e?.v !== 1 || typeof e.id !== "string" || typeof e.corpo !== "string") return null;
    if (e.origem !== "meta" && e.origem !== "telegram" && e.origem !== "tiktok") return null;
    if (e.origem !== "meta" && (typeof e.agentId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(e.agentId))) return null;
    return e as Envelope;
  } catch {
    return null;
  }
}

async function despachar(e: Envelope): Promise<Response> {
  const base = "https://interno.eva";
  if (e.origem === "meta") {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const sig = e.cabecalhos?.["x-hub-signature-256"];
    if (sig) headers["x-hub-signature-256"] = sig;
    return processarMeta(new Request(`${base}/api/webhooks/meta`, { method: "POST", headers, body: e.corpo }));
  }

  const segredoDoApp = process.env.INTERNAL_API_SECRET ?? "";
  const params = Promise.resolve({ agentId: e.agentId! });
  if (e.origem === "telegram") {
    const req = new Request(`${base}/api/webhooks/telegram/${e.agentId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": segredoDoApp },
      body: e.corpo,
    });
    return processarTelegram(req, { params });
  }
  const url = new URL(`${base}/api/webhooks/tiktok/${e.agentId}`);
  if (segredoDoApp) url.searchParams.set("token", segredoDoApp);
  return processarTikTok(
    new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: e.corpo }),
    { params }
  );
}

export async function POST(request: Request) {
  const segredo = process.env.INGRESS_SIGNING_SECRET;
  if (!segredo) {
    // 503: o Worker segura na fila e tenta de novo depois de configurado.
    return NextResponse.json({ error: "INGRESS_SIGNING_SECRET não configurado." }, { status: 503 });
  }

  const corpo = await request.text();
  if (!assinaturaValida(segredo, request.headers.get("x-eva-timestamp"), corpo, request.headers.get("x-eva-signature"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const envelope = lerEnvelope(corpo);
  if (!envelope) return NextResponse.json({ error: "Envelope inválido." }, { status: 400 });

  try {
    const res = await despachar(envelope);
    if (res.status === 401 || res.status === 403) {
      // A rota de origem recusou a autenticação: segredo divergente entre
      // Worker e app. Repetir não resolve — vai para a fila morta e aparece.
      console.error("[internal/webhooks] rota de origem recusou", envelope.origem, envelope.id, res.status);
    }
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[internal/webhooks] falha ao processar", envelope.origem, envelope.id, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
