import type { FlowNodeData } from "./flow-node";

/**
 * De onde sai o e-mail do bloco "Enviar e-mail".
 *   "contrato"   = domínio verificado do contrato (conta Resend da plataforma),
 *                  com modelo da Biblioteca ou texto do bloco, descadastro e
 *                  supressão. Padrão de bloco novo.
 *   "credencial" = chave Resend própria cadastrada no bloco (o jeito antigo).
 *                  Bloco antigo que já tem credencial continua assim.
 * Usado pelo motor, pela validação e pelo inspector, para os três concordarem.
 */
export function fonteDoEmail(data: Pick<FlowNodeData, "emailModo" | "emailCredentialId">): "contrato" | "credencial" {
  return data.emailModo ?? (data.emailCredentialId ? "credencial" : "contrato");
}
