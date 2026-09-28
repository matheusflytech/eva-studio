import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";

// ---------------------------------------------------------------------------
// Validação do fluxo, mostrada no canvas antes de publicar.
//
// O problema que isto resolve: dava pra salvar um bloco de CRM sem etapa
// escolhida ou um bloco de IA sem credencial, e só descobrir depois, quando a
// conversa rodava e alguém ia ler a aba Execuções. O sistema já sabia que
// estava errado e ficava calado.
//
// Regra do que entra aqui: só o que IMPEDE o bloco de funcionar. Aviso de
// gosto ("essa mensagem está longa") não entra, senão o alerta vira ruído e
// as pessoas param de olhar.
// ---------------------------------------------------------------------------

const vazio = (v: string | undefined) => !v || !v.trim();

/** Por que este bloco não vai funcionar, ou null se estiver completo. */
export function validateNode(data: FlowNodeData): string | null {
  switch (data.iconKey) {
    case "message":
      return vazio(data.detail) ? "Escreva a mensagem que o agente vai enviar." : null;

    case "capture":
      if (vazio(data.detail)) return "Escreva a pergunta.";
      if (vazio(data.variableName)) return "Escolha em qual variável guardar a resposta.";
      return null;

    case "condition":
      return vazio(data.conditionExpression)
        ? 'Defina a condição, por exemplo {orcamento} > 5000.'
        : null;

    case "variable":
      return vazio(data.variableName) ? "Dê um nome à variável." : null;

    case "wait":
      return !data.waitDuration || data.waitDuration <= 0 ? "Informe quanto tempo esperar." : null;

    case "http":
    case "tool-http":
      return vazio(data.httpUrl) ? "Informe a URL da requisição." : null;

    case "email":
      if (vazio(data.emailCredentialId)) return "Escolha a credencial do Resend.";
      if (vazio(data.emailTo)) return "Informe o destinatário.";
      return null;

    case "ai-agent":
      return vazio(data.aiCredentialId)
        ? "Escolha a credencial do provedor de IA."
        : null;

    case "tool-mcp":
      return vazio(data.mcpServerId) ? "Escolha o servidor MCP." : null;

    case "tool-crm":
      return (data.crmToolActions ?? []).length === 0
        ? "Nenhuma ação liberada: a IA não poderá fazer nada."
        : null;

    // O motor exige etapa e etiqueta explícitas nesses dois. Nos outros
    // blocos de CRM ele tem padrão razoável (primeira etapa aberta do funil
    // padrão), então não travam.
    case "crm-stage":
      return vazio(data.crmStageId) ? "Escolha a etapa de destino." : null;

    case "crm-tag":
      return vazio(data.crmTagId) ? "Escolha a etiqueta." : null;

    case "crm-task":
      return vazio(data.crmTaskText) ? "Descreva a tarefa." : null;

    case "crm-note":
      return vazio(data.crmNoteText) ? "Escreva o texto da nota." : null;

    default:
      return null;
  }
}

export interface FlowIssue {
  nodeId: string;
  label: string;
  motivo: string;
}

const FERRAMENTAS = new Set(["tool-http", "tool-knowledge", "tool-mcp", "tool-crm"]);
/** Blocos que terminam o fluxo de propósito: não precisam de saída. */
const TERMINAIS = new Set(["end", "human", "agent", "ai-agent"]);

/**
 * Todos os problemas do fluxo: campo faltando em cada bloco, mais dois
 * problemas de ligação que só existem olhando o desenho inteiro.
 */
export function validateFlow(nodes: Node<FlowNodeData>[], edges: Edge[]): FlowIssue[] {
  const issues: FlowIssue[] = [];

  for (const node of nodes) {
    const motivo = validateNode(node.data);
    if (motivo) issues.push({ nodeId: node.id, label: node.data.label, motivo });
  }

  for (const node of nodes) {
    const kind = node.data.iconKey;

    // Ferramenta solta: é o erro mais silencioso do builder. Ela fica bonita
    // no canvas e simplesmente nunca é chamada.
    if (FERRAMENTAS.has(kind)) {
      const ligada = edges.some((e) => e.source === node.id && e.targetHandle === "tools");
      if (!ligada) {
        issues.push({
          nodeId: node.id,
          label: node.data.label,
          motivo: "Ferramenta solta: conecte na porta roxa de um bloco de IA.",
        });
      }
      continue;
    }

    if (TERMINAIS.has(kind)) continue;

    const temSaida = edges.some((e) => e.source === node.id);
    if (!temSaida) {
      issues.push({
        nodeId: node.id,
        label: node.data.label,
        motivo: "Não leva a lugar nenhum: a conversa para aqui sem encerrar.",
      });
    }
  }

  return issues;
}
