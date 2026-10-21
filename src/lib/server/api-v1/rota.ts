import "server-only";
import { autenticarChave } from "@/lib/server/api-keys";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { Corpo } from "@/lib/server/api-validacao";
import { escopoPermite, type Acao, type Recurso } from "./escopos";
import { ErroApi, novoRequestId, paraErroApi, respostaDeErro } from "./http";
import { comIdempotencia, validarChave } from "./idempotencia";

// ---------------------------------------------------------------------------
// Envoltório de toda rota da API v1: chave → escopo → limite → idempotência
// → handler, com o erro sempre no mesmo envelope e os headers de request id e
// rate limit em toda resposta. As rotas só escrevem a regra de negócio.
// ---------------------------------------------------------------------------

/** Por chave e por minuto (roteiro: leitura 600, escrita 300). */
export const LIMITES = { read: 600, write: 300 } as const;
const JANELA_SEG = 60;

export interface CtxV1 {
  orgId: string;
  keyId: string;
  scopes: string[];
  requestId: string;
  request: Request;
  url: URL;
  /** Corpo como objeto JSON; lança 400 se não for. */
  corpo(): Corpo;
  /** Corpo cru (para JSON que não é objeto, como uma lista). */
  corpoBruto: string;
}

export interface OpcoesDaRota {
  /** null = qualquer chave válida (só GET /v1/me, para testar a credencial). */
  recurso: Recurso | null;
  /** Padrão: GET = read, o resto = write. */
  acao?: Acao;
  /** "obrigatoria" em lote e importação. Padrão: opcional em POST/PATCH/PUT. */
  idempotencia?: "opcional" | "obrigatoria" | "nao";
}

type Handler<P> = (ctx: CtxV1, params: P) => Promise<Response>;

export function rotaV1<P extends Record<string, string> = Record<string, never>>(opcoes: OpcoesDaRota, handler: Handler<P>) {
  return async (request: Request, contexto: { params: Promise<P> }): Promise<Response> => {
    const requestId = novoRequestId();
    const headersDoLimite: Record<string, string> = {};
    const comHeaders = (r: Response) => {
      r.headers.set("X-Request-Id", requestId);
      for (const [k, v] of Object.entries(headersDoLimite)) r.headers.set(k, v);
      return r;
    };

    try {
      const chave = await autenticarChave(request);
      if (!chave) {
        throw new ErroApi(401, "invalid_api_key", "Chave de API inválida ou ausente. Envie Authorization: Bearer evs_live_...");
      }

      const acao: Acao = opcoes.acao ?? (request.method === "GET" ? "read" : "write");
      if (opcoes.recurso && !escopoPermite(chave.scopes, opcoes.recurso, acao)) {
        throw new ErroApi(403, "insufficient_scope", `Esta chave não tem o escopo ${opcoes.recurso}:${acao}.`, {
          details: { required: `${opcoes.recurso}:${acao}`, granted: chave.scopes },
        });
      }

      const limite = LIMITES[acao];
      const rate = await checkRateLimit(`apiv1:${chave.keyId}:${acao}`, limite, JANELA_SEG);
      const reset = String(rate.resetSec ?? JANELA_SEG);
      headersDoLimite["RateLimit-Limit"] = String(limite);
      headersDoLimite["RateLimit-Remaining"] = String(Math.max(0, limite - (rate.count ?? 0)));
      headersDoLimite["RateLimit-Reset"] = reset;
      if (!rate.allowed) {
        throw new ErroApi(429, "rate_limited", "Limite de requisições excedido. Tente de novo em instantes.", {
          headers: { "Retry-After": reset },
        });
      }

      const metodoComCorpo = !["GET", "DELETE", "HEAD"].includes(request.method);
      const corpoBruto = metodoComCorpo ? await request.text() : "";
      let corpoLido: Corpo | null | undefined;
      const url = new URL(request.url);
      const ctx: CtxV1 = {
        orgId: chave.orgId,
        keyId: chave.keyId,
        scopes: chave.scopes,
        requestId,
        request,
        url,
        corpoBruto,
        corpo() {
          if (corpoLido === undefined) {
            try {
              const v = corpoBruto.trim() ? JSON.parse(corpoBruto) : null;
              corpoLido = v && typeof v === "object" && !Array.isArray(v) ? (v as Corpo) : null;
            } catch {
              corpoLido = null;
            }
          }
          if (!corpoLido) throw new ErroApi(400, "invalid_json", "Corpo da requisição inválido: envie um objeto JSON.");
          return corpoLido;
        },
      };

      const params = (await contexto?.params) ?? ({} as P);
      const executar = async () => {
        try {
          return await handler(ctx, params);
        } catch (e) {
          return respostaDeErro(paraErroApi(e), requestId);
        }
      };

      const modo = opcoes.idempotencia ?? (metodoComCorpo ? "opcional" : "nao");
      const chaveIdem = modo === "nao" ? null : validarChave(request.headers.get("idempotency-key"));
      if (modo === "obrigatoria" && !chaveIdem) {
        throw new ErroApi(400, "idempotency_key_required", "Este endpoint exige o header Idempotency-Key.", {
          param: "Idempotency-Key",
        });
      }
      const resposta = chaveIdem
        ? await comIdempotencia(
            { orgId: chave.orgId, chave: chaveIdem, metodo: request.method, caminho: url.pathname, corpo: corpoBruto },
            executar
          )
        : await executar();
      return comHeaders(resposta);
    } catch (e) {
      return comHeaders(respostaDeErro(paraErroApi(e), requestId));
    }
  };
}
