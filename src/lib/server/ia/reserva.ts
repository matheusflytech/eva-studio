import "server-only";
import { callLlmWithTools, type CallLlmOptions, type LlmResult, type LlmToolCall } from "@/lib/server/llm";
import type { LlmProvider } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Chamada de IA com reserva automática.
//
// A conexão de IA do contrato é uma lista em ordem de preferência (chave +
// modelo). Tenta o primeiro; se o provedor falhar (chave recusada, fora do ar,
// limite, lentidão além do tempo limite, modelo que sumiu), passa para o
// próximo na mesma rodada. A pessoa do outro lado nem percebe.
//
// Duas travas:
//   - Se a IA já executou alguma ferramenta antes de falhar, NÃO tenta de
//     novo: repetir criaria o negócio/tarefa/nota duas vezes. O erro sobe e o
//     bloco segue pela saída "Erro".
//   - Recusa do modelo e estouro de rodadas de ferramenta não são falha do
//     provedor: outro modelo faria o mesmo pedido. O erro sobe direto.
// ---------------------------------------------------------------------------

export interface PassoDeIa {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** De onde veio (para o log de execuções): nome da credencial ou "plataforma". */
  origem: string;
  /** Credencial usada (para uso e limite); vazio = chave da plataforma. */
  credentialId?: string | null;
}

export type ChamadaSemProvedor = Omit<CallLlmOptions, "provider" | "apiKey" | "model">;

export interface ResultadoComReserva extends LlmResult {
  /** Passo que respondeu (ou o último tentado, se todos falharam). */
  usado?: PassoDeIa;
  /** Erros dos passos que falharam antes, na ordem. */
  tentativas: { origem: string; model: string; error: string }[];
}

/** O erro é do provedor (vale tentar o próximo) ou do pedido (não adianta)? */
export function ehErroDeReserva(error: string): boolean {
  return !/Pedido recusado|Excedeu o limite de rodadas/i.test(error);
}

export async function chamarComReserva(
  passos: PassoDeIa[],
  opts: ChamadaSemProvedor,
  chamar: (o: CallLlmOptions) => Promise<LlmResult> = callLlmWithTools,
  /** Chamado a cada tentativa (deu certo ou não), para registrar o consumo. */
  aoTentar?: (passo: PassoDeIa, result: LlmResult, ok: boolean) => void
): Promise<ResultadoComReserva> {
  const tentativas: ResultadoComReserva["tentativas"] = [];
  if (passos.length === 0) return { text: null, error: "Nenhuma chave de IA configurada.", tentativas };

  for (let i = 0; i < passos.length; i += 1) {
    const passo = passos[i];
    let executouFerramenta = false;
    const result = await chamar({
      ...opts,
      provider: passo.provider,
      apiKey: passo.apiKey,
      model: passo.model,
      executeTool: async (call: LlmToolCall) => {
        executouFerramenta = true;
        return opts.executeTool(call);
      },
    });

    const erro = result.error ?? (result.text ? undefined : "O provedor não devolveu resposta.");
    aoTentar?.(passo, result, !erro);
    if (!erro) return { ...result, usado: passo, tentativas };

    const ultimo = i === passos.length - 1;
    if (ultimo || executouFerramenta || !ehErroDeReserva(erro)) {
      return { text: result.text, error: erro, usado: passo, tentativas };
    }
    tentativas.push({ origem: passo.origem, model: passo.model, error: erro });
  }

  // Inalcançável: o laço sempre devolve no último passo.
  return { text: null, error: "Nenhuma chave de IA respondeu.", tentativas };
}
