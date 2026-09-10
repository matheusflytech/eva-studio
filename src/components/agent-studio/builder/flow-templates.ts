import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { generateId } from "@/lib/utils";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  build: () => { nodes: Node<FlowNodeData>[]; edges: Edge[] };
}

function n(id: string, x: number, y: number, data: FlowNodeData): Node<FlowNodeData> {
  return { id, type: "flowNode", position: { x, y }, data };
}

function e(source: string, target: string, sourceHandle?: string): Edge {
  return { id: `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ""}`, source, target, sourceHandle };
}

// Ids gerados a cada build() — assim dá pra aplicar o mesmo modelo mais de
// uma vez no mesmo agente (ou reaproveitar em vários agentes) sem colidir.
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "atendimento-menu",
    name: "Atendimento com menu",
    description: "Boas-vindas, coleta o nome, menu de opções e encaminha pra IA livre ou pra um humano.",
    build: () => {
      const inicio = generateId();
      const boasVindas = generateId();
      const coletaNome = generateId();
      const menu = generateId();
      const agente = generateId();
      const humano = generateId();
      const fim = generateId();
      const opAgente = generateId();
      const opHumano = generateId();

      return {
        nodes: [
          n(inicio, 380, 0, { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false }),
          n(boasVindas, 240, 150, {
            iconKey: "message",
            label: "Boas-vindas",
            kind: "Mensagem",
            detail: "Olá! Sou o assistente virtual. Como posso te chamar?",
          }),
          n(coletaNome, 240, 320, {
            iconKey: "capture",
            label: "Coleta de nome",
            kind: "Captura de input",
            detail: "Digite seu nome, por favor.",
            variableName: "nome_cliente",
          }),
          n(menu, 240, 490, {
            iconKey: "capture",
            label: "Menu de opções",
            kind: "Captura de input",
            detail: "Prazer, {nome_cliente}! Sobre o que você quer falar?",
            variableName: "opcao_escolhida",
            options: [
              { id: opAgente, label: "Tirar uma dúvida" },
              { id: opHumano, label: "Falar com atendente" },
            ],
          }),
          n(agente, 60, 660, {
            iconKey: "agent",
            label: "Agente de IA",
            kind: "Delega para o agente",
            detail: "Responde dúvidas livres usando a base de conhecimento.",
          }),
          n(humano, 420, 660, {
            iconKey: "human",
            label: "Transferir p/ humano",
            kind: "Exceção",
            detail: "Já te encaminho pra um atendente, {nome_cliente}.",
          }),
          n(fim, 240, 810, { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false }),
        ],
        edges: [
          e(inicio, boasVindas),
          e(boasVindas, coletaNome),
          e(coletaNome, menu),
          e(menu, agente, opAgente),
          e(menu, humano, opHumano),
          e(agente, fim),
          e(humano, fim),
        ],
      };
    },
  },
  {
    id: "faq-ia",
    name: "FAQ com IA",
    description: "Fluxo mínimo: boas-vindas e delega tudo pra IA (usando a base de conhecimento do agente).",
    build: () => {
      const inicio = generateId();
      const boasVindas = generateId();
      const agente = generateId();
      const fim = generateId();
      return {
        nodes: [
          n(inicio, 240, 0, { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false }),
          n(boasVindas, 240, 150, {
            iconKey: "message",
            label: "Boas-vindas",
            kind: "Mensagem",
            detail: "Olá! Pode perguntar o que quiser, vou te ajudar.",
          }),
          n(agente, 240, 300, {
            iconKey: "agent",
            label: "Agente de IA",
            kind: "Delega para o agente",
            detail: "Responde livremente usando as instruções e a base de conhecimento do agente.",
          }),
          n(fim, 240, 450, { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false }),
        ],
        edges: [e(inicio, boasVindas), e(boasVindas, agente), e(agente, fim)],
      };
    },
  },
  {
    id: "qualificacao-lead",
    name: "Qualificação de lead",
    description: "Coleta nome, telefone e interesse, manda pra um webhook (CRM) e confirma o recebimento.",
    build: () => {
      const inicio = generateId();
      const boasVindas = generateId();
      const nome = generateId();
      const telefone = generateId();
      const interesse = generateId();
      const webhook = generateId();
      const confirmacao = generateId();
      const fim = generateId();
      return {
        nodes: [
          n(inicio, 240, 0, { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false }),
          n(boasVindas, 240, 150, {
            iconKey: "message",
            label: "Boas-vindas",
            kind: "Mensagem",
            detail: "Oi! Vou fazer só 3 perguntas rápidas pra te encaminhar certinho.",
          }),
          n(nome, 240, 300, {
            iconKey: "capture",
            label: "Coleta de nome",
            kind: "Captura de input",
            detail: "Qual seu nome?",
            variableName: "nome_cliente",
          }),
          n(telefone, 240, 450, {
            iconKey: "capture",
            label: "Coleta de telefone",
            kind: "Captura de input",
            detail: "E o melhor telefone pra contato, {nome_cliente}?",
            variableName: "telefone_cliente",
          }),
          n(interesse, 240, 600, {
            iconKey: "capture",
            label: "Coleta de interesse",
            kind: "Captura de input",
            detail: "O que você tem interesse em contratar?",
            variableName: "interesse_cliente",
          }),
          n(webhook, 240, 750, {
            iconKey: "webhook",
            label: "Enviar pro CRM",
            kind: "Chamar webhook",
            detail: "Manda os dados coletados pro seu CRM/n8n.",
            webhookUrl: "",
            variableName: "resposta_crm",
          }),
          n(confirmacao, 240, 900, {
            iconKey: "message",
            label: "Confirmação",
            kind: "Mensagem",
            detail: "Perfeito, {nome_cliente}! Recebi seus dados e alguém do time vai te chamar em breve.",
          }),
          n(fim, 240, 1050, { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false }),
        ],
        edges: [
          e(inicio, boasVindas),
          e(boasVindas, nome),
          e(nome, telefone),
          e(telefone, interesse),
          e(interesse, webhook),
          e(webhook, confirmacao),
          e(confirmacao, fim),
        ],
      };
    },
  },
];
