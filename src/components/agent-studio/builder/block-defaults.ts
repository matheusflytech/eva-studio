import type { IconKey } from "./icon-registry";
import type { FlowNodeData } from "./flow-node";

export interface BlockDefault {
  key: IconKey;
  paletteLabel: string;
  data: Partial<FlowNodeData>;
}

export const BLOCK_DEFAULTS: BlockDefault[] = [
  {
    key: "message",
    paletteLabel: "Mensagem",
    data: { label: "Nova mensagem", kind: "Mensagem", detail: "Digite aqui o que o agente vai dizer." },
  },
  {
    key: "capture",
    paletteLabel: "Captura de input",
    data: { label: "Nova captura", kind: "Captura de input", detail: "Digite a pergunta que o agente vai fazer pro cliente." },
  },
  {
    key: "agent",
    paletteLabel: "Agente de IA",
    data: {
      label: "Agente de IA",
      kind: "Delega para o agente",
      detail: "Responde livremente usando as instruções e a base de conhecimento configuradas no agente.",
    },
  },
  {
    key: "condition",
    paletteLabel: "Condição",
    data: {
      label: "Nova condição",
      kind: "Condição",
      detail: "Defina a condição abaixo — arraste do lado Sim ou Não pra continuar o fluxo.",
      conditionExpression: "",
    },
  },
  {
    key: "variable",
    paletteLabel: "Variável",
    data: { label: "Nova variável", kind: "Variável", detail: "Guarda um valor pra usar depois na conversa.", variableName: "" },
  },
  {
    key: "http",
    paletteLabel: "Requisição HTTP",
    data: {
      label: "Requisição HTTP",
      kind: "Chama uma API externa",
      detail: "Chama uma URL externa e pode guardar a resposta numa variável.",
      httpMethod: "POST",
      httpUrl: "",
      httpAuthType: "none",
      httpHeaders: [],
      httpQueryParams: [],
      httpBody: "",
    },
  },
  {
    key: "email",
    paletteLabel: "Enviar e-mail",
    data: {
      label: "Enviar e-mail",
      kind: "Via Resend",
      detail: "Manda um e-mail usando uma credencial Resend cadastrada em Integrações.",
      emailFrom: "",
      emailTo: "",
      emailSubject: "",
      emailBody: "",
    },
  },
  {
    key: "ai-agent",
    paletteLabel: "Agente de IA (nativo)",
    data: {
      label: "Agente de IA",
      kind: "Responde com IA de verdade (Groq)",
      detail: "Você é um assistente útil e direto.",
      aiModel: "llama-3.3-70b-versatile",
      aiMemoryWindow: 20,
      collectVars: [],
    },
  },
  {
    key: "tool-http",
    paletteLabel: "Ferramenta: HTTP",
    data: {
      label: "Ferramenta HTTP",
      kind: "Conecta na porta de baixo de um Agente de IA",
      detail: "O agente decide os valores de qualquer {parametro} usado na URL/corpo.",
      httpMethod: "GET",
      httpUrl: "",
      httpAuthType: "none",
      httpHeaders: [],
      httpQueryParams: [],
      httpBody: "",
      hasTarget: false,
    },
  },
  {
    key: "tool-knowledge",
    paletteLabel: "Ferramenta: Base de conhecimento",
    data: {
      label: "Buscar na base de conhecimento",
      kind: "Conecta na porta de baixo de um Agente de IA",
      detail: "Sem configuração — busca nos documentos já carregados no agente.",
      hasTarget: false,
    },
  },
  {
    key: "tool-mcp",
    paletteLabel: "Ferramenta: MCP",
    data: {
      label: "Servidor MCP",
      kind: "Conecta na porta de baixo de um Agente de IA",
      detail: "O agente descobre sozinho as ferramentas que o servidor oferece.",
      mcpServerId: "",
      mcpTools: [],
      hasTarget: false,
    },
  },
  {
    key: "crm-deal",
    paletteLabel: "CRM: Criar negócio",
    data: {
      label: "Criar negócio",
      kind: "CRM",
      detail: "Cria um negócio no funil e vincula o contato da conversa.",
      crmDealName: "Negócio de {nome}",
      crmDealAmount: "",
      variableName: "negocio_id",
    },
  },
  {
    key: "crm-stage",
    paletteLabel: "CRM: Mover etapa",
    data: {
      label: "Mover etapa",
      kind: "CRM",
      detail: "Move o negócio aberto do contato para outra etapa do funil.",
    },
  },
  {
    key: "crm-task",
    paletteLabel: "CRM: Criar tarefa",
    data: {
      label: "Criar tarefa",
      kind: "CRM",
      detail: "Cria uma tarefa no inbox do responsável.",
      crmTaskType: "ligar",
      crmTaskText: "Retornar contato de {nome}",
      crmTaskDue: "+1 dia",
    },
  },
  {
    key: "crm-tag",
    paletteLabel: "CRM: Etiquetar",
    data: {
      label: "Etiquetar contato",
      kind: "CRM",
      detail: "Aplica ou remove uma etiqueta. Etiqueta aplicada pode disparar uma sequência.",
      crmTagAction: "add",
    },
  },
  {
    key: "crm-update",
    paletteLabel: "CRM: Atualizar dados",
    data: {
      label: "Atualizar dados",
      kind: "CRM",
      detail: "Grava respostas do cliente nos campos do negócio ou do contato.",
      crmUpdateTarget: "deal",
      crmAutoFill: true,
      crmFieldMap: [],
    },
  },
  {
    key: "crm-note",
    paletteLabel: "CRM: Registrar nota",
    data: {
      label: "Registrar nota",
      kind: "CRM",
      detail: "Escreve na linha do tempo do contato.",
      crmNoteText: "",
    },
  },
  {
    key: "crm-lookup",
    paletteLabel: "CRM: Buscar dados",
    data: {
      label: "Buscar no CRM",
      kind: "CRM",
      detail: "Carrega empresa, negócio e tarefas do contato em variáveis, pra Condição poder ramificar.",
    },
  },
  {
    key: "tool-crm",
    paletteLabel: "Ferramenta: CRM",
    data: {
      label: "Ferramentas de CRM",
      kind: "Conecta na porta de baixo de um Agente de IA",
      detail: "Deixa o agente criar negócio, mover etapa, criar tarefa e etiquetar sozinho.",
      crmToolActions: ["buscar", "criar_negocio", "atualizar_campos", "criar_tarefa", "etiquetar"],
      crmAllowedStageIds: [],
      crmMaxAmount: "",
      hasTarget: false,
    },
  },
  {
    key: "human",
    paletteLabel: "Transferir p/ humano",
    data: { label: "Transferir p/ humano", kind: "Exceção", detail: "Descreva quando esse bloco deve transferir pra um atendente." },
  },
  {
    key: "wait",
    paletteLabel: "Esperar",
    data: { label: "Esperar", kind: "Pausa", detail: "Quanto tempo esperar antes de continuar o fluxo.", waitDuration: 1, waitUnit: "minutos" },
  },
  {
    key: "end",
    paletteLabel: "Encerrar",
    data: { label: "Encerramento", kind: "Fim da conversa", hasSource: false },
  },
];

export function getBlockDefault(key: IconKey): BlockDefault | undefined {
  return BLOCK_DEFAULTS.find((b) => b.key === key);
}
