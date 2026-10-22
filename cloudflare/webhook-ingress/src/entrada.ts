import { iguaisEmTempoConstante, verificarAssinaturaMeta } from "./assinatura";
import { chaveDeDedupe, jaVisto, marcarVisto } from "./dedupe";
import { entregarAoApp } from "./entrega";
import { rotear, type Rota } from "./rotas";
import type { ContextoDeExecucao, EnvelopeDeWebhook, Env } from "./tipos";

// Mensagem da fila tem teto de 128 KB; deixa folga para os metadados.
export const TAMANHO_MAX_NA_FILA = 120_000;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** Handshakes GET: a Meta e o TikTok validam a URL de callback com um eco. */
function verificacaoGet(rota: Rota, url: URL, env: Env): Response {
  if (rota.origem === "meta") {
    const esperado = env.META_WEBHOOK_VERIFY_TOKEN;
    if (!esperado) return json({ error: "META_WEBHOOK_VERIFY_TOKEN não configurado." }, 503);
    const ok =
      url.searchParams.get("hub.mode") === "subscribe" &&
      iguaisEmTempoConstante(url.searchParams.get("hub.verify_token"), esperado);
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : json({ error: "Verificação inválida." }, 403);
  }
  if (rota.origem === "tiktok") {
    const desafio = url.searchParams.get("challenge") ?? url.searchParams.get("hub.challenge");
    return desafio ? new Response(desafio, { status: 200 }) : json({ ok: true });
  }
  return json({ error: "Método não permitido." }, 405);
}

/** Autenticidade por origem. Devolve uma Response de erro, ou null se passou. */
async function autenticar(rota: Rota, request: Request, url: URL, corpoCru: string, env: Env): Promise<Response | null> {
  if (rota.origem === "meta") {
    if (!env.META_APP_SECRET) return json({ error: "META_APP_SECRET não configurado." }, 503);
    const ok = await verificarAssinaturaMeta(corpoCru, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET);
    return ok ? null : json({ error: "Assinatura inválida." }, 401);
  }
  if (rota.origem === "telegram") {
    if (!env.TELEGRAM_SECRET_TOKEN) return json({ error: "TELEGRAM_SECRET_TOKEN não configurado." }, 503);
    const ok = iguaisEmTempoConstante(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_SECRET_TOKEN);
    return ok ? null : json({ error: "Não autorizado." }, 401);
  }
  // TikTok não assina o corpo: segredo na querystring da URL de callback.
  if (!env.TIKTOK_WEBHOOK_TOKEN) return json({ error: "TIKTOK_WEBHOOK_TOKEN não configurado." }, 503);
  const ok = iguaisEmTempoConstante(url.searchParams.get("token"), env.TIKTOK_WEBHOOK_TOKEN);
  return ok ? null : json({ error: "Não autorizado." }, 401);
}

/**
 * Entrada: valida, deduplica, enfileira e responde. Nada de banco nem motor
 * de fluxo aqui — por isso a resposta sai em poucos milissegundos.
 *
 * Ordem importa: só marca "visto" DEPOIS que a fila aceitou. Se a fila falhar,
 * devolve 500 e a origem re-tenta (sem ter sido marcado, não vira descarte).
 */
export async function tratarEntrada(request: Request, env: Env, ctx: ContextoDeExecucao): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return json({ ok: true });

  const rota = rotear(url.pathname);
  if (!rota) return json({ error: "Não encontrado." }, 404);

  if (request.method === "GET") return verificacaoGet(rota, url, env);
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  // Corpo como TEXTO: o HMAC da Meta é sobre os bytes exatos.
  const corpoCru = await request.text();
  const negado = await autenticar(rota, request, url, corpoCru, env);
  if (negado) return negado;

  // Mesmo comportamento do app: corpo da Meta que não é JSON é 400.
  if (rota.origem === "meta") {
    try {
      JSON.parse(corpoCru);
    } catch {
      return json({ error: "Corpo inválido." }, 400);
    }
  }

  const chave = await chaveDeDedupe(rota.origem, rota.agentId, corpoCru);
  if (await jaVisto(env.DEDUPE, chave)) return json({ ok: true, duplicado: true });

  const envelope: EnvelopeDeWebhook = {
    v: 1,
    id: chave,
    origem: rota.origem,
    agentId: rota.agentId,
    recebidoEm: new Date().toISOString(),
    corpo: corpoCru,
    cabecalhos:
      rota.origem === "meta" ? { "x-hub-signature-256": request.headers.get("x-hub-signature-256") ?? undefined } : {},
  };

  const tamanho = new TextEncoder().encode(JSON.stringify(envelope)).length;
  if (tamanho > TAMANHO_MAX_NA_FILA) {
    // Raro (lote gigante): não cabe na fila, entrega direto e espera o app.
    if (!env.INGRESS_SIGNING_SECRET) return json({ error: "INGRESS_SIGNING_SECRET não configurado." }, 503);
    const r = await entregarAoApp(env.APP_URL, env.INGRESS_SIGNING_SECRET, envelope);
    if (r.tipo !== "ok") return json({ error: "App indisponível." }, 502);
    ctx.waitUntil(marcarVisto(env.DEDUPE, chave));
    return json({ ok: true, direto: true });
  }

  try {
    await env.FILA_ENTRADA.send(envelope);
  } catch (e) {
    console.error("[entrada] fila recusou", e instanceof Error ? e.message : e);
    return json({ error: "Falha ao enfileirar." }, 500);
  }

  ctx.waitUntil(
    marcarVisto(env.DEDUPE, chave).catch((e) => console.error("[entrada] kv falhou", e instanceof Error ? e.message : e))
  );
  return json({ ok: true });
}
