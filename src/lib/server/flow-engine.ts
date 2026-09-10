import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";

export interface OutboundMessage {
  text: string;
  options?: { id: string; label: string }[];
}

export interface AdvanceInput {
  agentId: string;
  channel: string;
  contactId: string;
  text?: string;
  optionId?: string;
}

export interface AdvanceResult {
  messages: OutboundMessage[];
  status: "active" | "waiting_human" | "ended";
}

type Variables = Record<string, unknown>;

function interpolate(template: string, variables: Variables): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

// Suporta "{variavel} == \"valor\"", "{variavel} != \"valor\"" ou só "{variavel}"
// (checa se é "verdadeiro" — não vazio/zero/false). Sem eval — é comparação de
// string simples, propositalmente limitado.
function evaluateCondition(expression: string, variables: Variables): boolean {
  const expr = (expression ?? "").trim();
  const comparison = expr.match(/^\{(\w+)\}\s*(==|!=)\s*"([^"]*)"$/);
  if (comparison) {
    const [, key, op, expected] = comparison;
    const actual = String(variables[key] ?? "");
    return op === "==" ? actual === expected : actual !== expected;
  }
  const bare = expr.match(/^\{(\w+)\}$/);
  if (bare) {
    const value = variables[bare[1]];
    return Boolean(value) && value !== "0" && value !== "false";
  }
  return false;
}

async function callAgentWebhook(
  agent: { id: string; name: string; tone: string; language: string; instructions: string; guidelines: string; outboundUrl: string },
  message: string,
  conversationId: string,
  variables: Variables
): Promise<string | null> {
  if (!agent.outboundUrl) return null;
  try {
    const res = await fetch(agent.outboundUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        agent: {
          id: agent.id,
          name: agent.name,
          tone: agent.tone,
          language: agent.language,
          instructions: agent.instructions,
          guidelines: agent.guidelines,
        },
        variables,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.reply === "string" && data.reply.trim() ? data.reply : null;
  } catch {
    return null;
  }
}

function findNode(nodes: Node<FlowNodeData>[], id: string | null): Node<FlowNodeData> | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

function nextNodeId(edges: Edge[], fromId: string, sourceHandle?: string | null): string | null {
  const edge = edges.find((e) => e.source === fromId && (sourceHandle == null || e.sourceHandle === sourceHandle));
  return edge?.target ?? null;
}

const MAX_HOPS = 25;

export async function advanceConversation(input: AdvanceInput): Promise<AdvanceResult> {
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
  if (!agent) return { messages: [], status: "ended" };

  const flow = await prisma.agentFlow.findUnique({ where: { agentId: input.agentId } });

  // Sem fluxo salvo: comportamento antigo, direto pro webhook do agente —
  // mantém compatível quem nunca configurou o Builder.
  if (!flow) {
    const conversationId = `${input.channel}:${input.contactId}`;
    const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, {});
    return {
      messages: reply ? [{ text: reply }] : [],
      status: "active",
    };
  }

  const nodes = flow.nodes as unknown as Node<FlowNodeData>[];
  const edges = flow.edges as unknown as Edge[];

  const conversation = await prisma.conversation.upsert({
    where: { agentId_channel_contactId: { agentId: input.agentId, channel: input.channel, contactId: input.contactId } },
    create: { agentId: input.agentId, channel: input.channel, contactId: input.contactId, variables: {} },
    update: {},
  });

  if (conversation.status === "waiting_human") {
    return { messages: [], status: "waiting_human" };
  }

  const variables: Variables = { ...(conversation.variables as Variables) };
  const messages: OutboundMessage[] = [];
  let currentId = conversation.currentNodeId;
  let status: AdvanceResult["status"] = "active";

  // Resolve o nó em que a conversa estava parada (Captura, Agente de IA ou
  // Esperar) usando a mensagem que acabou de chegar, antes de continuar
  // andando pelo fluxo.
  const parkedNode = findNode(nodes, currentId);
  if (parkedNode?.data.iconKey === "capture") {
    const options = parkedNode.data.options ?? [];
    let resolvedOptionId = input.optionId;
    // Se não veio um id de botão (ex: o cliente respondeu em texto livre em
    // vez de tocar o botão), tenta casar pelo número da opção ou pelo texto
    // do rótulo antes de desistir.
    if (!resolvedOptionId && options.length > 0 && input.text) {
      const t = input.text.trim().toLowerCase();
      const byNumber = options[parseInt(t, 10) - 1];
      const byLabel = options.find((o) => o.label.trim().toLowerCase() === t);
      resolvedOptionId = byNumber?.id ?? byLabel?.id;
    }

    if (options.length > 0 && !resolvedOptionId) {
      // Não reconheceu a opção — repete a pergunta em vez de travar a conversa.
      messages.push({
        text: interpolate(parkedNode.data.detail ?? "", variables),
        options: options.map((o) => ({ id: o.id, label: o.label })),
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { currentNodeId: parkedNode.id, variables, updatedAt: new Date() },
      });
      return { messages, status: "active" };
    }

    if (parkedNode.data.variableName) {
      variables[parkedNode.data.variableName] =
        options.length > 0 ? options.find((o) => o.id === resolvedOptionId)?.label ?? resolvedOptionId : input.text;
    }
    const handle = options.length > 0 ? resolvedOptionId : undefined;
    currentId = nextNodeId(edges, parkedNode.id, handle);
  } else if (parkedNode?.data.iconKey === "agent") {
    const conversationId = `${input.channel}:${input.contactId}`;
    const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, variables);
    if (reply) messages.push({ text: reply });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { variables, updatedAt: new Date() },
    });
    return { messages, status: "active" };
  } else if (parkedNode?.data.iconKey === "wait") {
    const wakeAt = variables.__wait_until as string | undefined;
    if (wakeAt && new Date(wakeAt) > new Date()) {
      return { messages: [], status: "active" }; // ainda não é hora, ignora essa mensagem
    }
    delete variables.__wait_until;
    currentId = nextNodeId(edges, parkedNode.id);
  } else if (!parkedNode) {
    // Conversa nova (ou já tinha encerrado) — recomeça do início.
    const start = nodes.find((n) => n.data.iconKey === "start");
    currentId = start ? nextNodeId(edges, start.id) : null;
  }

  for (let hops = 0; hops < MAX_HOPS && currentId; hops += 1) {
    const node = findNode(nodes, currentId);
    if (!node) break;

    const kind = node.data.iconKey;

    if (kind === "message") {
      messages.push({ text: interpolate(node.data.detail ?? "", variables) });
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "capture") {
      const options = node.data.options ?? [];
      messages.push({
        text: interpolate(node.data.detail ?? "", variables),
        options: options.length > 0 ? options.map((o) => ({ id: o.id, label: o.label })) : undefined,
      });
      currentId = node.id; // fica parado aqui esperando a resposta
      break;
    }

    if (kind === "condition") {
      const result = evaluateCondition(node.data.conditionExpression ?? "", variables);
      currentId = nextNodeId(edges, node.id, result ? "true" : "false");
      continue;
    }

    if (kind === "variable") {
      if (node.data.variableName && !(node.data.variableName in variables)) {
        variables[node.data.variableName] = "";
      }
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "webhook") {
      if (node.data.webhookUrl) {
        try {
          const res = await fetch(node.data.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ variables, contactId: input.contactId, agentId: input.agentId }),
          });
          const raw = await res.text();
          let value: unknown = raw;
          try {
            const parsed = JSON.parse(raw);
            value = parsed?.value ?? parsed?.reply ?? parsed?.result ?? parsed;
          } catch {
            // resposta não era JSON, usa o texto puro mesmo
          }
          if (node.data.variableName) variables[node.data.variableName] = value;
        } catch {
          // um webhook falhando não deve travar o fluxo inteiro
        }
      }
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "agent") {
      const conversationId = `${input.channel}:${input.contactId}`;
      const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, variables);
      if (reply) messages.push({ text: reply });
      currentId = node.id; // fica "alugado" pra IA livre até o contato parar de responder
      break;
    }

    if (kind === "human") {
      if (node.data.detail) messages.push({ text: interpolate(node.data.detail, variables) });
      status = "waiting_human";
      currentId = null;
      break;
    }

    if (kind === "wait") {
      const durationMs =
        (node.data.waitDuration ?? 1) *
        (node.data.waitUnit === "horas" ? 3_600_000 : node.data.waitUnit === "segundos" ? 1000 : 60_000);
      variables.__wait_until = new Date(Date.now() + durationMs).toISOString();
      currentId = node.id;
      break;
    }

    if (kind === "end") {
      if (node.data.detail) messages.push({ text: interpolate(node.data.detail, variables) });
      status = "ended";
      currentId = null;
      break;
    }

    // Tipo desconhecido (ex: "start" alcançado de novo) — só segue em frente.
    currentId = nextNodeId(edges, node.id);
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { currentNodeId: currentId, variables, status, updatedAt: new Date() },
  });

  return { messages, status };
}
