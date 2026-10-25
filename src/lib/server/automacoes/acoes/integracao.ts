import "server-only";
import { safeFetch } from "@/lib/server/ssrf";
import { headersAssinados } from "@/lib/server/webhooks/assinatura";
import { lerJson, seguro } from "./comum";
import type { CtxDaAcao, ManipuladorDeAcao, ResultadoDaAcao } from "./tipos";

// Integração: "Enviar para o n8n" (POST com o registro, assinado no padrão
// Standard Webhooks quando o passo tem segredo) e "Chamar uma API". A resposta
// JSON vira `passos.<id>.resposta`. safeFetch barra rede interna e redirect.
// O webhook-id é a chave de idempotência do passo: quem recebe descarta repetido.

const LIMITE_RESPOSTA = 16_000;
const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function lerRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n) * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.max(0, t - Date.now());
}

/** Resposta em saída do passo; 2xx ok, 408/429/5xx/rede tenta de novo, outro 4xx é definitivo. */
export async function interpretarResposta(r: Response, inicio: number): Promise<ResultadoDaAcao> {
  const bruto = (await r.text().catch(() => "")).slice(0, LIMITE_RESPOSTA);
  let resposta: unknown = bruto;
  try {
    resposta = bruto ? JSON.parse(bruto) : null;
  } catch {
    /* fica o texto */
  }
  const ms = Date.now() - inicio;
  if (r.status >= 200 && r.status < 300) return { ok: true, saida: { status: r.status, ms, resposta } };
  const passageiro = r.status === 408 || r.status === 429 || r.status >= 500;
  return {
    ok: false,
    erro: `Respondeu ${r.status}${typeof resposta === "string" && resposta ? `: ${resposta.slice(0, 300)}` : ""}`,
    retentavel: passageiro,
    tentarDepoisMs: passageiro ? lerRetryAfter(r.headers.get("retry-after")) : undefined,
  };
}

/** Erro de rede em português, com o endereço (o código técnico fica no fim, para quem precisar). */
export function explicarErroDeRede(msg: string, url: string): string {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // URL estranha: mostra como veio
  }
  const codigo = msg.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|CERT_[A-Z_]+|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)\b/)?.[1];
  const tecnico = codigo ? ` (${codigo})` : "";
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return `Não achei o endereço ${host}. Confira a URL do webhook${tecnico}.`;
  if (codigo === "ECONNREFUSED") return `${host} recusou a conexão: o serviço parece fora do ar${tecnico}.`;
  if (codigo === "ECONNRESET") return `${host} derrubou a conexão no meio do envio${tecnico}.`;
  if (codigo === "ETIMEDOUT" || codigo === "EHOSTUNREACH") return `${host} não respondeu a tempo${tecnico}.`;
  if (codigo && /CERT|SIGN/.test(codigo)) return `O certificado de segurança de ${host} não é válido${tecnico}.`;
  return `Falha de rede ao chamar ${host}: ${msg}`;
}

async function chamar(url: string, init: RequestInit): Promise<ResultadoDaAcao> {
  const inicio = Date.now();
  try {
    return await interpretarResposta(await safeFetch(url, init), inicio);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // URL bloqueada (rede interna, não resolve): repetir não adianta.
    if (/interno|não resolve|inválid|protocol/i.test(msg)) return { ok: false, erro: msg };
    return { ok: false, erro: e instanceof Error && e.name === "AbortError" ? "Sem resposta a tempo." : explicarErroDeRede(msg, url), retentavel: true };
  }
}

/**
 * O que vai no corpo para o n8n: o registro e o que mais ele precisa para
 * decidir. Funil e etapa pelo número do contrato, como na API v1 (a foto
 * interna guarda o UUID).
 */
async function corpoParaN8n(ctx: CtxDaAcao, extra: unknown) {
  const { comNumeros } = await import("@/lib/server/api-v1/funis");
  return {
    evento: "automacao.passo",
    // true quando veio do botão Testar do editor: o fluxo do n8n pode ignorar
    teste: ctx.teste,
    automacao_id: ctx.automacaoId,
    execucao_id: ctx.execucaoId,
    passo_id: ctx.noId,
    objeto: ctx.objeto,
    registro: await comNumeros(ctx.contexto.registro),
    contato: ctx.contexto.contato,
    empresa: ctx.contexto.empresa,
    gatilho: await comNumeros(ctx.contexto.gatilho),
    extra: extra ?? {},
  };
}

export const ACOES_DE_INTEGRACAO: Record<string, ManipuladorDeAcao> = {
  "n8n.webhook": (config, ctx) =>
    seguro(async () => {
      const url = String(config.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, erro: "Informe a URL completa do nó Webhook do n8n." };
      const extra = lerJson(config.extra, {});
      if (!extra.ok) return { ok: false, erro: "Dados extras: JSON inválido." };
      const corpo = JSON.stringify(await corpoParaN8n(ctx, extra.valor));
      const segredo = typeof config.segredo === "string" && config.segredo.startsWith("whsec_") ? config.segredo : null;
      return chamar(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EvaStudio-Automacoes/1.0",
          ...(segredo ? headersAssinados(segredo, ctx.idempotencia, corpo) : { "webhook-id": ctx.idempotencia }),
        },
        body: corpo,
      });
    }),

  "http.request": (config, ctx) =>
    seguro(async () => {
      const url = String(config.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, erro: "Informe a URL completa (https://...)." };
      const metodo = String(config.metodo ?? "POST").toUpperCase();
      if (!METODOS.has(metodo)) return { ok: false, erro: "Método inválido." };
      const cab = lerJson(config.cabecalhos, {});
      if (!cab.ok || !cab.valor || typeof cab.valor !== "object" || Array.isArray(cab.valor)) return { ok: false, erro: "Cabeçalhos: use um JSON como {\"Authorization\": \"Bearer ...\"}." };
      const cabecalhos = Object.fromEntries(Object.entries(cab.valor as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      const corpo = metodo === "GET" || metodo === "DELETE" ? undefined : String(config.corpo ?? "");
      if (corpo && !Object.keys(cabecalhos).some((k) => k.toLowerCase() === "content-type")) {
        cabecalhos["Content-Type"] = lerJson(corpo).ok ? "application/json" : "text/plain; charset=utf-8";
      }
      return chamar(url, {
        method: metodo,
        headers: { "User-Agent": "EvaStudio-Automacoes/1.0", "Idempotency-Key": ctx.idempotencia, ...cabecalhos },
        body: corpo || undefined,
      });
    }),
};
