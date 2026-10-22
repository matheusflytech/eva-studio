import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { generateId } from "@/lib/utils";
import { organizarFluxo } from "./auto-layout";
import { SAIDA_ERRO } from "./saidas";

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
// As posições escritas abaixo são só ponto de partida: o modelo sai sempre
// pelo auto-layout (esquerda→direita), igual ao botão "Organizar".
const MODELOS: FlowTemplate[] = [
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
            iconKey: "ai-agent",
            label: "Tirar dúvidas com IA",
            kind: "Responde com a Central de IA",
            detail: "Tire as dúvidas de {nome_cliente}. Se a pessoa pedir um atendente, diga que vai chamar alguém.",
            aiFonte: "conexao",
            aiMemoryWindow: 20,
            collectVars: [],
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
          e(agente, humano, SAIDA_ERRO),
          e(humano, fim),
        ],
      };
    },
  },
  {
    id: "faq-ia",
    name: "FAQ com IA",
    description: "Fluxo mínimo: boas-vindas e a IA responde usando a base de conhecimento do agente.",
    build: () => {
      const inicio = generateId();
      const boasVindas = generateId();
      const agente = generateId();
      const base = generateId();
      const humano = generateId();
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
            iconKey: "ai-agent",
            label: "Responder com IA",
            kind: "Responde com a Central de IA",
            detail: "Responda as perguntas usando a base de conhecimento. Se não achar a resposta, diga que vai verificar.",
            aiFonte: "conexao",
            aiMemoryWindow: 20,
            collectVars: [],
          }),
          n(base, 240, 420, {
            iconKey: "tool-knowledge",
            label: "Buscar na base de conhecimento",
            kind: "Conecta na porta de baixo de um Agente de IA",
            detail: "Sem configuração — busca nos documentos já carregados no agente.",
            hasTarget: false,
          }),
          n(humano, 420, 450, {
            iconKey: "human",
            label: "Falar com atendente",
            kind: "Para o bot e chama uma pessoa",
            detail: "Vou te passar para alguém da equipe, só um instante.",
          }),
          n(fim, 240, 450, { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false }),
        ],
        edges: [
          e(inicio, boasVindas),
          e(boasVindas, agente),
          e(agente, fim),
          e(agente, humano, SAIDA_ERRO),
          { id: `e-${base}-${agente}-tools`, source: base, target: agente, targetHandle: "tools" },
        ],
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

// Para quem já tem o atendimento num workflow do n8n: a Eva recebe a
// mensagem, manda para a URL do agente (Avançado → Ligar a um fluxo do n8n)
// e devolve a resposta. Quando o n8n responde { "done": true }, segue para o
// Encerramento.
MODELOS.push({
  id: "atendimento-n8n",
  name: "Atendimento pelo n8n",
  description: "Boas-vindas e o seu workflow do n8n responde. Precisa da URL do webhook do n8n.",
  build: () => {
    const inicio = generateId();
    const boasVindas = generateId();
    const n8n = generateId();
    const fim = generateId();
    return {
      nodes: [
        n(inicio, 240, 0, { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false }),
        n(boasVindas, 240, 150, { iconKey: "message", label: "Boas-vindas", kind: "Mensagem", detail: "Olá! Como posso te ajudar?" }),
        n(n8n, 240, 300, {
          iconKey: "agent",
          label: "Enviar para o n8n",
          kind: "Seu fluxo do n8n responde",
          detail: "A mensagem vai para o workflow do n8n e a resposta dele volta para a pessoa.",
        }),
        n(fim, 240, 450, { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", hasSource: false }),
      ],
      edges: [e(inicio, boasVindas), e(boasVindas, n8n), e(n8n, fim)],
    };
  },
});

/** Modelo que só funciona com a URL do n8n preenchida no agente. */
export const MODELOS_COM_N8N = new Set(["atendimento-n8n"]);

export const FLOW_TEMPLATES: FlowTemplate[] = MODELOS.map((m) => ({
  ...m,
  build: () => {
    const { nodes, edges } = m.build();
    return { nodes: organizarFluxo(nodes, edges), edges };
  },
}));
