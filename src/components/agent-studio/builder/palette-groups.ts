import type { IconKey } from "./icon-registry";

// ---------------------------------------------------------------------------
// Como a paleta se apresenta.
//
// Separado de block-defaults.ts de propósito: lá mora o que o bloco É (os
// campos que ele guarda, o rótulo que aparece no canvas); aqui mora como ele
// se explica para quem está montando o fluxo.
//
// A paleta tinha 21 blocos numa lista plana, sem grupo e sem busca, e
// "Mensagem" (que todo mundo usa) aparecia com o mesmo peso de "Ferramenta:
// MCP" (que quase ninguém usa). A hierarquia abaixo é o que ensina a regra
// sem precisar de texto explicativo.
// ---------------------------------------------------------------------------

export interface PaletteItem {
  key: IconKey;
  /** Rótulo na paleta. Pode diferir do rótulo que o bloco ganha no canvas. */
  label: string;
  /** Uma linha dizendo o que faz, em português de quem não programa. */
  hint: string;
  /**
   * Ferramenta: não funciona sozinha, só conectada na porta roxa embaixo de
   * um bloco de IA. Na paleta aparece recuada, dentro do grupo de IA.
   */
  tool?: boolean;
}

export interface PaletteGroup {
  id: string;
  label: string;
  /** Grupos fechados por padrão: o que quase ninguém precisa no dia a dia. */
  collapsed?: boolean;
  items: PaletteItem[];
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: "conversa",
    label: "Conversa",
    items: [
      { key: "message", label: "Mensagem", hint: "O agente fala alguma coisa." },
      // "Captura de input" era nome de programador. Perguntar é o que o
      // bloco faz: pergunta e espera a resposta.
      { key: "capture", label: "Perguntar", hint: "Faz uma pergunta e guarda a resposta." },
      { key: "wait", label: "Esperar", hint: "Pausa antes de continuar o fluxo." },
      { key: "human", label: "Falar com atendente", hint: "Para o bot e chama uma pessoa." },
      { key: "end", label: "Encerrar", hint: "Fecha a conversa." },
    ],
  },
  {
    id: "decisao",
    label: "Decisão",
    items: [
      { key: "condition", label: "Condição", hint: "Segue por um caminho ou outro." },
      { key: "variable", label: "Variável", hint: "Guarda ou calcula um valor." },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { key: "crm-deal", label: "Criar negócio", hint: "Abre um negócio no funil." },
      { key: "crm-stage", label: "Mover etapa", hint: "Avança o negócio no funil." },
      { key: "crm-task", label: "Criar tarefa", hint: "Gera um follow-up para a equipe." },
      { key: "crm-tag", label: "Etiquetar", hint: "Marca o contato. Pode iniciar uma sequência." },
      { key: "crm-update", label: "Atualizar dados", hint: "Grava o que o cliente respondeu nos campos do negócio." },
      { key: "crm-note", label: "Registrar nota", hint: "Escreve na linha do tempo do contato." },
      { key: "crm-lookup", label: "Buscar dados", hint: "Lê o CRM para a Condição decidir." },
    ],
  },
  {
    id: "ia",
    label: "Inteligência artificial",
    items: [
      // Os dois se chamavam "Agente de IA" e "Agente de IA (nativo)". Ninguém
      // acertava qual era qual sem abrir os dois.
      { key: "ai-agent", label: "Responder com IA", hint: "O modelo responde livremente na conversa." },
      { key: "agent", label: "Enviar para meu fluxo", hint: "Delega a resposta ao seu webhook do n8n." },
      { key: "tool-knowledge", label: "Base de conhecimento", hint: "Deixa a IA buscar nos seus documentos.", tool: true },
      { key: "tool-crm", label: "Ações de CRM", hint: "Deixa a IA criar negócio e tarefa sozinha.", tool: true },
      { key: "tool-http", label: "Chamar uma API", hint: "Deixa a IA consultar um sistema seu.", tool: true },
      { key: "tool-mcp", label: "Servidor MCP", hint: "Dá à IA as ferramentas de um servidor MCP.", tool: true },
    ],
  },
  {
    id: "avancado",
    label: "Avançado",
    collapsed: true,
    items: [
      { key: "http", label: "Requisição HTTP", hint: "Chama uma URL e guarda a resposta." },
      { key: "email", label: "Enviar e-mail", hint: "Dispara um e-mail pelo Resend." },
    ],
  },
];

/** Texto de busca de um item, sem acento e em minúscula. */
export function searchable(item: PaletteItem): string {
  return `${item.label} ${item.hint}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
