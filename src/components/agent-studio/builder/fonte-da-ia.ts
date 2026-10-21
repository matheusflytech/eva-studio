import type { FlowNodeData } from "./flow-node";

/**
 * De onde o bloco de IA tira a chave e o modelo. Bloco antigo (sem
 * `aiFonte`) que já tem credencial continua com ela; sem credencial, usa a
 * conexão do contrato, que antes não existia e o bloco simplesmente falhava.
 * Usado pelo motor e pelo inspector, para os dois concordarem.
 */
export function fonteDaIa(data: Pick<FlowNodeData, "aiFonte" | "aiCredentialId">): "conexao" | "bloco" {
  return data.aiFonte ?? (data.aiCredentialId ? "bloco" : "conexao");
}
