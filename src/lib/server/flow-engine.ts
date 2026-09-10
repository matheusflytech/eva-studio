import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { truncateForPrompt } from "@/lib/server/extract-text";

export interface OutboundMessage {
  text: string;
  options?: { id: string; label: string }[];
  // Fora da janela de 24h e o bloco não tem modelo escolhido — a mensagem
  // ainda é enviada como texto livre, mas quem manda de verdade (worker/rota
  // da Meta) deve avisar, porque a Meta rejeita texto livre fora da janela.
  requiresTemplate?: boolean;
  // Fora da janela e o bloco tem um modelo aprovado — quem manda de verdade
  // deve usar a API de templates da Meta com esses dados em vez de texto.
  template?: { name: string; languageCode: string; parameters: string[] };
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

// Suporta "{variavel} <op> \"valor\"" (op: == != > < >= <=), "{variavel} <op> 123"
// (compara numérico se os dois lados forem número) ou só "{variavel}" (checa
// se é "verdadeiro" — não vazio/zero/false). Sem eval — é regex + comparação
// simples, propositalmente limitado (ver docs/CHATBOT_ENGINE.md §7).
function evaluateCondition(expression: string, variables: Variables): boolean {
  const expr = (expression ?? "").trim();
  const comparison = expr.match(/^\{(\w+)\}\s*(==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?))$/);
  if (comparison) {
    const [, key, op, quoted, numeric] = comparison;
    const actual = variables[key];

    if (numeric !== undefined) {
      const actualNum = Number(actual);
      const expectedNum = Number(numeric);
      if (Number.isNaN(actualNum)) return op === "!=";
      switch (op) {
        case "==": return actualNum === expectedNum;
        case "!=": return actualNum !== expectedNum;
        case ">": return actualNum > expectedNum;
        case "<": return actualNum < expectedNum;
        case ">=": return actualNum >= expectedNum;
        default: return actualNum <= expectedNum; // "<="
      }
    }

    const actualStr = String(actual ?? "");
    const expected = quoted ?? "";
    switch (op) {
      case "==": return actualStr === expected;
      case "!=": return actualStr !== expected;
      case ">": return actualStr > expected;
      case "<": return actualStr < expected;
      case ">=": return actualStr >= expected;
      default: return actualStr <= expected; // "<="
    }
  }
  const bare = expr.match(/^\{(\w+)\}$/);
  if (bare) {
    const value = variables[bare[1]];
    return Boolean(value) && value !== "0" && value !== "false";
  }
  return false;
}

// Resolve o bloco Variável quando tem uma expressão configurada: interpola
// todo {var} primeiro (isso já cobre concatenação, ex: "{nome} {sobrenome}"),
// e se o resultado virar uma soma/subtração simples de dois números
// ("10 + 5"), calcula. Continua sem eval de verdade — só esses dois casos.
function resolveVariableExpression(expression: string, variables: Variables): string {
  const interpolated = interpolate(expression, variables);
  const arithmetic = interpolated.match(/^(-?\d+(?:\.\d+)?)\s*([+-])\s*(-?\d+(?:\.\d+)?)$/);
  if (arithmetic) {
    const [, a, op, b] = arithmetic;
    const result = op === "+" ? Number(a) + Number(b) : Number(a) - Number(b);
    return String(result);
  }
  return interpolated;
}

interface AgentForWebhook {
  id: string;
  name: string;
  tone: string;
  language: string;
  instructions: string;
  guidelines: string;
  outboundUrl: string;
}

// Busca o texto já extraído dos documentos desse agente e injeta no payload
// pro n8n usar como contexto (ver docs/CHATBOT_ENGINE.md — não é busca
// vetorial, é o texto inteiro dos documentos, truncado por segurança).
async function getKnowledgeBaseContext(agentId: string): Promise<string[]> {
  const docs = await prisma.knowledgeDoc.findMany({ where: { agentId }, select: { fileName: true, content: true } });
  return docs.filter((d) => d.content.trim()).map((d) => `# ${d.fileName}\n${truncateForPrompt(d.content)}`);
}

async function callAgentWebhook(
  agent: AgentForWebhook,
  message: string,
  conversationId: string,
  variables: Variables
): Promise<string | null> {
  if (!agent.outboundUrl) return null;
  try {
    const knowledgeBaseContext = await getKnowledgeBaseContext(agent.id);
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
        knowledgeBaseContext,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.reply === "string" && data.reply.trim() ? data.reply : null;
  } catch {
    return null;
  }
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

// Janela de 24h da Meta: enquanto ela estiver aberta, o negócio pode mandar
// texto livre em resposta; fora dela, só mensagem de modelo pré-aprovado.
// Só importa pro canal whatsapp_meta — WhatsApp via QR (Baileys) e Playground
// não são a API oficial, então essa regra não existe pra eles.
function isOutsideWindow(lastContactMessageAt: Date | null): boolean {
  return !lastContactMessageAt || Date.now() - lastContactMessageAt.getTime() > WINDOW_MS;
}

// Resolve o que mandar num bloco de Mensagem: se a janela tá aberta (ou não é
// canal Meta), manda o texto normal. Se tá fechada, usa o modelo escolhido no
// bloco (se tiver) montando os parâmetros posicionais na ordem certa; sem
// modelo escolhido, ainda manda o texto mas marca requiresTemplate pra quem
// for enviar de verdade saber que a Meta provavelmente vai rejeitar.
async function resolveOutboundMessage(
  node: Node<FlowNodeData>,
  variables: Variables,
  agentId: string,
  outsideWindow: boolean
): Promise<OutboundMessage> {
  const text = interpolate(node.data.detail ?? "", variables);
  if (!outsideWindow) return { text };

  if (node.data.templateId) {
    const tpl = await prisma.messageTemplate.findFirst({ where: { id: node.data.templateId, agentId } });
    if (tpl && tpl.metaTemplateName) {
      const order = (tpl.variableOrder as unknown as string[]) ?? [];
      return {
        text: interpolate(tpl.bodyText, variables),
        template: {
          name: tpl.metaTemplateName,
          languageCode: tpl.metaLanguageCode,
          parameters: order.map((name) => String(variables[name] ?? "")),
        },
      };
    }
    if (tpl) return { text: interpolate(tpl.bodyText, variables), requiresTemplate: true };
  }

  return { text, requiresTemplate: true };
}

function findNode(nodes: Node<FlowNodeData>[], id: string | null): Node<FlowNodeData> | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

// Exportado também pro endpoint de "retomar bot" (fase de inbox humano) —
// resolve qual bloco vem depois de um dado nó, mesma lógica usada aqui dentro.
export function nextNodeId(edges: Edge[], fromId: string, sourceHandle?: string | null): string | null {
  const edge = edges.find((e) => e.source === fromId && (sourceHandle == null || e.sourceHandle === sourceHandle));
  return edge?.target ?? null;
}

const MAX_HOPS = 25;

// Grava a transcrição real (pra página Conversas) — a mensagem que chegou
// (se teve) e cada mensagem que o bot mandou nessa rodada, na ordem.
async function logMessages(conversationId: string, inboundText: string | undefined, outbound: OutboundMessage[]) {
  const rows: { conversationId: string; role: string; text: string }[] = [];
  if (inboundText) rows.push({ conversationId, role: "contact", text: inboundText });
  for (const m of outbound) rows.push({ conversationId, role: "bot", text: m.text });
  if (rows.length > 0) await prisma.message.createMany({ data: rows });
}

export async function advanceConversation(input: AdvanceInput): Promise<AdvanceResult> {
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
  if (!agent) return { messages: [], status: "ended" };

  const flow = await prisma.agentFlow.findUnique({ where: { agentId: input.agentId } });

  // Sem fluxo salvo: comportamento antigo, direto pro webhook do agente —
  // mantém compatível quem nunca configurou o Builder. Ainda assim regista a
  // transcrição, pra Conversas mostrar dado real mesmo nesse modo.
  if (!flow) {
    const conversationId = `${input.channel}:${input.contactId}`;
    const conversation = await prisma.conversation.upsert({
      where: { agentId_channel_contactId: { agentId: input.agentId, channel: input.channel, contactId: input.contactId } },
      create: { agentId: input.agentId, channel: input.channel, contactId: input.contactId, variables: {} },
      update: { updatedAt: new Date() },
    });
    const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, {});
    const messages = reply ? [{ text: reply }] : [];
    await logMessages(conversation.id, input.text, messages);
    if (input.text !== undefined || input.optionId !== undefined) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastContactMessageAt: new Date() } });
    }
    return { messages, status: "active" };
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
  const inboundText = input.text ?? (input.optionId ? `[opção: ${input.optionId}]` : undefined);

  // Uma mensagem/toque de verdade do contato sempre reabre a janela de 24h —
  // por isso, quando isGenuineInbound é true, outsideWindow fica sempre false
  // (a resposta de agora conta como dentro da janela). Só fica true quando o
  // motor é acordado sem nada vindo do contato (ex: retomada de um Esperar
  // vencido) e o último contato de verdade já passou de 24h.
  const isGenuineInbound = input.text !== undefined || input.optionId !== undefined;
  const outsideWindow = input.channel === "whatsapp_meta" && !isGenuineInbound && isOutsideWindow(conversation.lastContactMessageAt);

  async function finish(): Promise<AdvanceResult> {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        currentNodeId: currentId,
        variables: variables as Prisma.InputJsonValue,
        status,
        updatedAt: new Date(),
        lastContactMessageAt: isGenuineInbound ? new Date() : conversation.lastContactMessageAt,
      },
    });
    await logMessages(conversation.id, inboundText, messages);
    return { messages, status };
  }

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
      currentId = parkedNode.id;
      return finish();
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
    return finish();
  } else if (parkedNode?.data.iconKey === "wait") {
    const wakeAt = variables.__wait_until as string | undefined;
    if (wakeAt && new Date(wakeAt) > new Date()) {
      return { messages: [], status: "active" }; // ainda não é hora, ignora essa mensagem (não regista transcrição)
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
      messages.push(await resolveOutboundMessage(node, variables, input.agentId, outsideWindow));
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
      if (node.data.variableName) {
        if (node.data.variableExpression) {
          variables[node.data.variableName] = resolveVariableExpression(node.data.variableExpression, variables);
        } else if (!(node.data.variableName in variables)) {
          variables[node.data.variableName] = "";
        }
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
      // Fica "parado" no próprio bloco (em vez de null) — é o que permite o
      // atendente clicar "Retomar bot" depois e o motor saber pra onde ir a
      // seguir (nextNodeId a partir daqui), em vez de perder a posição.
      currentId = node.id;
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

  return finish();
}
