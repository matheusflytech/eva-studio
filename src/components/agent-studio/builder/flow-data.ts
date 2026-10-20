import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { organizarFluxo } from "./auto-layout";

// Fluxo de exemplo de um agente novo (sem fluxo salvo). O menu tem opções de
// verdade e cada ligação sai da opção certa: antes o menu era só um texto
// "Comercial · Financeiro · ..." com ligações sem saída, e a conversa morria
// ali sem ninguém entender por quê.
const NOS: Node<FlowNodeData>[] = [
  {
    id: "inicio",
    type: "flowNode",
    position: { x: 0, y: 0 },
    data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false },
  },
  {
    id: "boas-vindas",
    type: "flowNode",
    position: { x: 0, y: 0 },
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
    position: { x: 0, y: 0 },
    data: {
      iconKey: "capture",
      label: "Coleta de nome",
      kind: "Captura de input",
      detail: "Para começar, como posso te chamar?",
      variableName: "nome_cliente",
    },
  },
  {
    id: "menu-opcoes",
    type: "flowNode",
    position: { x: 0, y: 0 },
    data: {
      iconKey: "capture",
      label: "Menu de opções",
      kind: "Captura de input",
      detail: "Sobre o que você quer falar, {nome_cliente}?",
      variableName: "opcao_escolhida",
      options: [
        { id: "op-duvida", label: "Tirar uma dúvida" },
        { id: "op-atendente", label: "Falar com atendente" },
      ],
    },
  },
  {
    id: "agente-ia",
    type: "flowNode",
    position: { x: 0, y: 0 },
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
    position: { x: 0, y: 0 },
    data: {
      iconKey: "human",
      label: "Transferir p/ humano",
      kind: "Exceção",
      detail: "Já te encaminho para um atendente, {nome_cliente}.",
    },
  },
];

export const SAMPLE_EDGES: Edge[] = [
  { id: "e-inicio-boasvindas", source: "inicio", target: "boas-vindas" },
  { id: "e-boasvindas-coleta", source: "boas-vindas", target: "coleta-nome" },
  { id: "e-coleta-menu", source: "coleta-nome", target: "menu-opcoes" },
  { id: "e-menu-agente", source: "menu-opcoes", sourceHandle: "op-duvida", target: "agente-ia" },
  { id: "e-menu-humano", source: "menu-opcoes", sourceHandle: "op-atendente", target: "transferir-humano" },
];

export const SAMPLE_NODES: Node<FlowNodeData>[] = organizarFluxo(NOS, SAMPLE_EDGES);
