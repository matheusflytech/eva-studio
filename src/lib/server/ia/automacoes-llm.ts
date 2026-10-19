import "server-only";
import { callLlmWithTools } from "@/lib/server/llm";
import { escolherProvedorDeIa, type ProvedorDeIa } from "@/lib/server/ia/provedor";

// ---------------------------------------------------------------------------
// IA que monta automações (réguas de sequência e fluxos do agente).
//
// De onde vem a chave: reaproveita escolherProvedorDeIa (ia/provedor.ts, o
// mesmo do dashboard) — credencial de LLM cadastrada pela org em Integrações,
// na ordem de preferência de lá; sem nenhuma, a GROQ_API_KEY do ambiente
// (mesmo fallback da transcrição de áudio). Sem as duas, a rota responde 503
// e a tela explica como cadastrar.
//
// Saída estrita: o modelo entrega o rascunho chamando a ferramenta
// `entregar_rascunho`. A camada llm.ts só declara parâmetros string, então o
// JSON vem como string (ou objeto, dependendo do provedor) e é lido aqui.
// ---------------------------------------------------------------------------

export type { ProvedorDeIa };
export const resolverProvedorDeIa = escolherProvedorDeIa;

export type ResultadoDoRascunho =
  | { ok: true; rascunho: unknown; explicacao: string }
  | { ok: false; motivo: "llm"; detalhe: string }
  | { ok: false; motivo: "json"; detalhe: string };

/** Tira cercas de markdown e lê JSON; aceita objeto já pronto. */
export function lerJson(valor: unknown): unknown {
  if (valor && typeof valor === "object") return valor;
  if (typeof valor !== "string") return undefined;
  let texto = valor.trim();
  const cerca = texto.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (cerca) texto = cerca[1];
  try {
    return JSON.parse(texto);
  } catch {
    // Texto com prosa em volta: tenta o maior bloco entre chaves.
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(texto.slice(ini, fim + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/**
 * Pede o rascunho ao modelo. Uma chamada só: a ferramenta captura os
 * argumentos e o laço de llm.ts para por limite de rodadas, sem pagar uma
 * segunda chamada só para o modelo dizer "pronto".
 */
export async function pedirRascunho(opts: {
  provedor: ProvedorDeIa;
  systemPrompt: string;
  userMessage: string;
  descricaoDaFerramenta: string;
  maxTokens?: number;
}): Promise<ResultadoDoRascunho> {
  let capturado: Record<string, unknown> | null = null;

  const resultado = await callLlmWithTools({
    provider: opts.provedor.provider,
    apiKey: opts.provedor.apiKey,
    model: opts.provedor.model,
    systemPrompt: opts.systemPrompt,
    userMessage: opts.userMessage,
    tools: [
      {
        name: "entregar_rascunho",
        description: opts.descricaoDaFerramenta,
        params: [
          { name: "rascunho", description: "O rascunho, como JSON seguindo exatamente o esquema pedido." },
          { name: "explicacao", description: "Duas ou três frases, em português, explicando o que o rascunho faz." },
        ],
      },
    ],
    executeTool: async (call) => {
      if (call.name === "entregar_rascunho" && !capturado) capturado = call.arguments as Record<string, unknown>;
      return "Rascunho recebido.";
    },
    maxIterations: 1,
    effort: "medium",
    maxTokens: opts.maxTokens ?? 4096,
  });

  const args = capturado as Record<string, unknown> | null;
  if (args) {
    const rascunho = lerJson(args.rascunho);
    if (rascunho === undefined || rascunho === null || typeof rascunho !== "object") {
      return { ok: false, motivo: "json", detalhe: "O modelo devolveu um rascunho que não é JSON válido." };
    }
    const explicacao = typeof args.explicacao === "string" ? args.explicacao.trim().slice(0, 600) : "";
    return { ok: true, rascunho, explicacao };
  }

  // Sem chamar a ferramenta: alguns modelos respondem o JSON como texto.
  if (resultado.text) {
    const lido = lerJson(resultado.text);
    if (lido && typeof lido === "object") {
      const obj = lido as Record<string, unknown>;
      const rascunho = obj.rascunho && typeof obj.rascunho === "object" ? obj.rascunho : obj;
      const explicacao = typeof obj.explicacao === "string" ? obj.explicacao.trim().slice(0, 600) : "";
      return { ok: true, rascunho, explicacao };
    }
    return { ok: false, motivo: "json", detalhe: "O modelo respondeu em texto em vez de entregar o rascunho." };
  }

  return { ok: false, motivo: "llm", detalhe: resultado.error ?? "Sem resposta do modelo." };
}

export const LIMITE_DO_PEDIDO = 800;

/** Lê e confere o corpo comum das duas rotas: { pedido, atual? }. */
export function lerCorpoDoPedido(body: unknown): { pedido: string; atual: unknown } | { erro: string } {
  if (!body || typeof body !== "object") return { erro: "Corpo inválido." };
  const b = body as Record<string, unknown>;
  const pedido = typeof b.pedido === "string" ? b.pedido.trim() : "";
  if (pedido.length < 5) return { erro: "Conta um pouco mais do que a automação deve fazer." };
  if (pedido.length > LIMITE_DO_PEDIDO) return { erro: `O pedido pode ter até ${LIMITE_DO_PEDIDO} caracteres.` };
  const atual = b.atual && typeof b.atual === "object" ? b.atual : undefined;
  if (atual && JSON.stringify(atual).length > 60_000) return { erro: "O rascunho atual é grande demais para ajustar." };
  return { pedido, atual };
}

/** Limite por org: rascunho custa chamada de LLM paga pela própria org. */
export const LIMITE_POR_HORA = 30;
