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
    key: "webhook",
    paletteLabel: "Chamar webhook",
    data: { label: "Chamar webhook", kind: "Chamar webhook", detail: "Chama uma URL externa e pode guardar a resposta numa variável.", webhookUrl: "" },
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
