import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";

export const SAMPLE_NODES: Node<FlowNodeData>[] = [
  {
    id: "inicio",
    type: "flowNode",
    position: { x: 380, y: 0 },
    data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false },
  },
  {
    id: "boas-vindas",
    type: "flowNode",
    position: { x: 240, y: 130 },
    data: {
      iconKey: "message",
      label: "Boas-vindas",
      kind: "Mensagem",
      detail: "Seja bem-vindo(a)! Sou a {nome_agente}, posso te ajudar hoje.",
    },
  },
  {
    id: "coleta-nome",
    type: "flowNode",
    position: { x: 240, y: 280 },
    data: {
      iconKey: "capture",
      label: "Coleta de nome",
      kind: "Captura de input",
      detail: "Para começar, como posso te chamar?",
    },
  },
  {
    id: "menu-opcoes",
    type: "flowNode",
    position: { x: 240, y: 430 },
    data: {
      iconKey: "capture",
      label: "Menu de opções",
      kind: "Captura de input",
      detail: "Comercial · Financeiro · Suporte · Falar com atendente",
    },
  },
  {
    id: "agente-ia",
    type: "flowNode",
    position: { x: 60, y: 590 },
    data: {
      iconKey: "agent",
      label: "Agente de IA",
      kind: "Delega para o agente",
      detail: "Responde dúvidas livres usando a base de conhecimento.",
    },
  },
  {
    id: "transferir-humano",
    type: "flowNode",
    position: { x: 420, y: 590 },
    data: {
      iconKey: "human",
      label: "Transferir p/ humano",
      kind: "Exceção",
      detail: "Quando o cliente pedir atendente ou o agente não resolver.",
    },
  },
  {
    id: "encerramento",
    type: "flowNode",
    position: { x: 240, y: 730 },
    data: { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false },
  },
];

export const SAMPLE_EDGES: Edge[] = [
  { id: "e-inicio-boasvindas", source: "inicio", target: "boas-vindas" },
  { id: "e-boasvindas-coleta", source: "boas-vindas", target: "coleta-nome" },
  { id: "e-coleta-menu", source: "coleta-nome", target: "menu-opcoes" },
  { id: "e-menu-agente", source: "menu-opcoes", target: "agente-ia" },
  { id: "e-menu-humano", source: "menu-opcoes", target: "transferir-humano" },
  { id: "e-agente-fim", source: "agente-ia", target: "encerramento" },
  { id: "e-humano-fim", source: "transferir-humano", target: "encerramento" },
];
