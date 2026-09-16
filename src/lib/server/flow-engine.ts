import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData, KeyValueRow } from "@/components/agent-studio/builder/flow-node";
import { truncateForPrompt } from "@/lib/server/prompt-utils";
import { getCredentialSecret } from "@/lib/server/credentials";
import { callGroqWithTools, type GroqTool, type GroqToolCall } from "@/lib/server/groq";
import { sendEmail } from "@/lib/server/resend";
import { searchKnowledgeBase } from "@/lib/server/knowledge-search";
import { safeFetch } from "@/lib/server/ssrf";

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
  // Idioma escolhido pelo visitante (ex: "pt", "en", "es") — hoje só o
  // widget do site manda isso (o seletor de idioma da Eva Holding); repassado
  // pro webhook do agente pra ele responder no idioma certo. Opcional e sem
  // efeito nenhum no motor em si, só passa adiante.
  lang?: string;
}

export interface AdvanceResult {
  messages: OutboundMessage[];
  status: "active" | "waiting_human" | "ended";
}

type Variables = Record<string, unknown>;

// Nomes de variável vêm do Builder (usuário) e viram chaves de objeto. Bloqueia
// chaves que poluiriam o prototype (__proto__, constructor, prototype) —
// defesa em profundidade contra prototype pollution.
const UNSAFE_VAR_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function setVar(variables: Variables, name: string | undefined, value: unknown): void {
  if (!name || UNSAFE_VAR_KEYS.has(name)) return;
  variables[name] = value;
}

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

// Executa um bloco HTTP (ou a variante tool-http) — monta método, URL+query,
// headers+auth e corpo, interpola {variavel} em tudo, e devolve o corpo da
// resposta (como JSON se der, texto puro senão). Uma falha de rede nunca
// derruba o fluxo/a ferramenta, só devolve null.
async function performHttpRequest(data: FlowNodeData, variables: Variables): Promise<{ value: unknown; error?: string }> {
  const method = data.httpMethod ?? "GET";
  const baseUrl = interpolate(data.httpUrl ?? "", variables);
  if (!baseUrl) return { value: null, error: "URL vazia." };

  try {
    const url = new URL(baseUrl);
    for (const row of data.httpQueryParams ?? []) {
      if (row.key) url.searchParams.set(interpolate(row.key, variables), interpolate(row.value, variables));
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    for (const row of data.httpHeaders ?? []) {
      if (row.key) headers[interpolate(row.key, variables)] = interpolate(row.value, variables);
    }
    if (data.httpAuthType === "bearer" && data.httpAuthValue) {
      headers.Authorization = `Bearer ${interpolate(data.httpAuthValue, variables)}`;
    } else if (data.httpAuthType === "header" && data.httpAuthValue) {
      const [name, ...rest] = data.httpAuthValue.split(":");
      if (name && rest.length) headers[name.trim()] = interpolate(rest.join(":").trim(), variables);
    }

    const hasBody = method !== "GET" && method !== "DELETE" && data.httpBody;
    const res = await safeFetch(url.toString(), {
      method,
      headers,
      body: hasBody ? interpolate(data.httpBody ?? "", variables) : undefined,
    });
    const raw = await res.text();
    try {
      return { value: JSON.parse(raw) };
    } catch {
      return { value: raw };
    }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// Nome de função válido pro function-calling da Groq (só [a-zA-Z0-9_-], sem
// espaço) — derivado do nome do bloco de ferramenta no canvas.
function toToolFunctionName(label: string, fallback: string): string {
  const slug = (label || fallback).toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || fallback;
}

// Qualquer {placeholder} usado na URL/headers/query/corpo de uma ferramenta
// HTTP que NÃO seja uma variável já capturada na conversa vira um parâmetro
// que o próprio modelo decide preencher ao chamar a ferramenta — reaproveita
// a mesma sintaxe {} já usada em todo o motor, só que "ao contrário".
function extractToolParams(data: FlowNodeData, variables: Variables): string[] {
  const haystack = [
    data.httpUrl ?? "",
    data.httpBody ?? "",
    ...(data.httpHeaders ?? []).flatMap((r: KeyValueRow) => [r.key, r.value]),
    ...(data.httpQueryParams ?? []).flatMap((r: KeyValueRow) => [r.key, r.value]),
  ].join(" ");
  const found = new Set<string>();
  for (const match of haystack.matchAll(/\{(\w+)\}/g)) {
    if (!(match[1] in variables)) found.add(match[1]);
  }
  return Array.from(found);
}

// Janela deslizante de memória (igual "Buffer Window Memory" do n8n/Flowise):
// busca as últimas N mensagens JÁ GRAVADAS dessa conversa (a mensagem atual
// ainda não foi persistida nesse ponto — só entra depois, em finish()/
// logMessages — então não precisa filtrar duplicata aqui) e devolve em ordem
// cronológica no formato que a Groq espera.
async function loadConversationHistory(
  conversationId: string,
  windowSize: number
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  if (windowSize <= 0) return [];
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: windowSize,
  });
  return rows.reverse().map((m) => ({ role: m.role === "contact" ? ("user" as const) : ("assistant" as const), content: m.text }));
}

const SAVE_SLOTS_TOOL = "salvar_dados_coletados";

// Roda o Agente de IA nativo (bloco "ai-agent"): junta as ferramentas
// conectadas na porta "tools" (tool-http/tool-knowledge), monta a chamada
// pra Groq com function-calling — incluindo memória da conversa e a
// ferramenta interna de coleta de variáveis (collectVars) — e devolve o texto
// final já depois do loop de tool-calling (ver src/lib/server/groq.ts).
async function runAiAgent(
  node: Node<FlowNodeData>,
  agentId: string,
  userMessage: string,
  variables: Variables,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  conversationId: string
): Promise<{ text: string | null; error?: string }> {
  const apiKey = node.data.aiCredentialId ? await getCredentialSecret(node.data.aiCredentialId) : null;
  if (!apiKey) return { text: null, error: "Credencial Groq não configurada nesse bloco." };

  const toolNodes = edges
    .filter((e) => e.target === node.id && e.targetHandle === "tools")
    .map((e) => findNode(nodes, e.source))
    .filter((n): n is Node<FlowNodeData> => !!n);

  const tools: GroqTool[] = toolNodes.map((tn, i) =>
    tn.data.iconKey === "tool-knowledge"
      ? {
          name: toToolFunctionName(tn.data.label, `buscar_conhecimento_${i}`),
          description: tn.data.detail || "Busca os trechos mais relevantes na base de conhecimento do agente a partir de uma consulta.",
          params: [{ name: "consulta", description: "O que buscar — palavras-chave ou a pergunta do usuário." }],
        }
      : {
          name: toToolFunctionName(tn.data.label, `ferramenta_${i}`),
          description: tn.data.detail || `Chama ${tn.data.httpMethod ?? "GET"} ${tn.data.httpUrl ?? ""}`,
          params: extractToolParams(tn.data, variables).map((p) => ({ name: p })),
        }
  );
  const toolNodeByName = new Map(tools.map((t, i) => [t.name, toolNodes[i]]));

  // Coleta estruturada de variáveis (estilo "slots" do Rasa + function-calling
  // do Dify): cada linha configurada vira um campo opcional de uma ferramenta
  // interna que o modelo chama assim que identifica um valor na conversa — o
  // system prompt lista o que já foi coletado e o que ainda falta, pra ele
  // perguntar ativamente em vez de só esperar o usuário se oferecer.
  const collectVars = (node.data.collectVars ?? []).filter((v) => v.key.trim());
  const missingVars = collectVars.filter((v) => !String(variables[v.key] ?? "").trim());
  const collectedVars = collectVars.filter((v) => String(variables[v.key] ?? "").trim());

  if (collectVars.length > 0) {
    tools.push({
      name: SAVE_SLOTS_TOOL,
      description:
        "Chame sempre que o usuário informar (ou corrigir) qualquer um dos dados que você precisa coletar nesta conversa — pode preencher só os campos que acabou de descobrir, não precisa saber todos de uma vez.",
      params: collectVars.map((v) => ({ name: v.key, description: v.value, required: false })),
    });
  }

  let systemPrompt = node.data.detail || "Você é um assistente útil.";
  if (collectVars.length > 0) {
    const lines = ["", "## Dados que você precisa coletar nesta conversa"];
    if (collectedVars.length) lines.push(`Já coletados: ${collectedVars.map((v) => `${v.key}=${variables[v.key]}`).join(", ")}.`);
    if (missingVars.length) {
      lines.push(`Ainda faltam: ${missingVars.map((v) => `${v.key} (${v.value})`).join(", ")}.`);
      lines.push(
        `Sempre que o usuário informar um desses dados, chame a ferramenta "${SAVE_SLOTS_TOOL}" com os campos que identificou, e continue a conversa naturalmente perguntando pelo que ainda falta.`
      );
    } else {
      lines.push("Todos os dados já foram coletados — não precisa mais perguntar por eles.");
    }
    systemPrompt += lines.join("\n");
  }

  const history = await loadConversationHistory(conversationId, node.data.aiMemoryWindow ?? 20);

  try {
    const text = await callGroqWithTools({
      apiKey,
      model: node.data.aiModel || "llama-3.3-70b-versatile",
      systemPrompt,
      userMessage,
      history,
      tools,
      executeTool: async (call: GroqToolCall) => {
        if (call.name === SAVE_SLOTS_TOOL) {
          const saved: string[] = [];
          for (const v of collectVars) {
            const value = call.arguments[v.key];
            if (value !== undefined && String(value).trim()) {
              setVar(variables, v.key, value);
              saved.push(v.key);
            }
          }
          return saved.length > 0 ? `Salvo: ${saved.join(", ")}.` : "Nenhum campo novo recebido.";
        }
        const toolNode = toolNodeByName.get(call.name);
        if (!toolNode) return "Ferramenta não encontrada.";
        if (toolNode.data.iconKey === "tool-knowledge") {
          const query = String(call.arguments.consulta ?? userMessage);
          const chunks = await searchKnowledgeBase(agentId, query, 4);
          return chunks.join("\n\n") || "Nenhum trecho relevante encontrado na base de conhecimento.";
        }
        const result = await performHttpRequest(toolNode.data, { ...variables, ...call.arguments });
        return result.error ? `Erro: ${result.error}` : JSON.stringify(result.value ?? null);
      },
    });
    return { text, error: text ? undefined : "Groq não devolveu resposta." };
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function callAgentWebhook(
  agent: AgentForWebhook,
  message: string,
  conversationId: string,
  variables: Variables,
  lang?: string
): Promise<string | null> {
  if (!agent.outboundUrl) return null;
  try {
    const knowledgeBaseContext = await getKnowledgeBaseContext(agent.id);
    // safeFetch: bloqueia SSRF (URL configurada pelo usuário não pode apontar
    // pra rede interna) e aplica timeout.
    const res = await safeFetch(agent.outboundUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        lang,
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
    const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, {}, input.lang);
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

  // Passo a passo da execução (aba "Execuções") — um registro leve por bloco
  // visitado, não a variável inteira (evita vazar dado sensível no log).
  interface FlowStep { nodeId: string; kind: string; label: string; output?: string; error?: string; ms: number }
  const steps: FlowStep[] = [];
  function pushStep(node: Node<FlowNodeData>, extra: { output?: string; error?: string } = {}, startedAt = Date.now()) {
    steps.push({ nodeId: node.id, kind: node.data.iconKey, label: node.data.label, ms: Date.now() - startedAt, ...extra });
  }

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
    if (steps.length > 0) {
      await prisma.flowExecution.create({
        data: {
          agentId: input.agentId,
          conversationId: `${input.channel}:${input.contactId}`,
          status: steps.some((s) => s.error) ? "error" : "success",
          steps: steps as unknown as Prisma.InputJsonValue,
        },
      });
    }
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
      setVar(
        variables,
        parkedNode.data.variableName,
        options.length > 0 ? options.find((o) => o.id === resolvedOptionId)?.label ?? resolvedOptionId : input.text
      );
    }
    const handle = options.length > 0 ? resolvedOptionId : undefined;
    currentId = nextNodeId(edges, parkedNode.id, handle);
  } else if (parkedNode?.data.iconKey === "agent") {
    const conversationId = `${input.channel}:${input.contactId}`;
    const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, variables, input.lang);
    if (reply) messages.push({ text: reply });
    pushStep(parkedNode, { output: reply ?? undefined, error: reply ? undefined : "sem resposta do webhook" });
    return finish();
  } else if (parkedNode?.data.iconKey === "ai-agent") {
    const reply = await runAiAgent(parkedNode, agent.id, input.text ?? "", variables, nodes, edges, conversation.id);
    if (reply.text) messages.push({ text: reply.text });
    pushStep(parkedNode, { output: reply.text ?? undefined, error: reply.error });
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
      const startedAt = Date.now();
      const resolved = await resolveOutboundMessage(node, variables, input.agentId, outsideWindow);
      messages.push(resolved);
      pushStep(node, { output: resolved.text }, startedAt);
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "capture") {
      const options = node.data.options ?? [];
      const text = interpolate(node.data.detail ?? "", variables);
      messages.push({
        text,
        options: options.length > 0 ? options.map((o) => ({ id: o.id, label: o.label })) : undefined,
      });
      pushStep(node, { output: text });
      currentId = node.id; // fica parado aqui esperando a resposta
      break;
    }

    if (kind === "condition") {
      const result = evaluateCondition(node.data.conditionExpression ?? "", variables);
      pushStep(node, { output: result ? "Sim" : "Não" });
      currentId = nextNodeId(edges, node.id, result ? "true" : "false");
      continue;
    }

    if (kind === "variable") {
      if (node.data.variableName && !UNSAFE_VAR_KEYS.has(node.data.variableName)) {
        if (node.data.variableExpression) {
          setVar(variables, node.data.variableName, resolveVariableExpression(node.data.variableExpression, variables));
        } else if (!(node.data.variableName in variables)) {
          setVar(variables, node.data.variableName, "");
        }
      }
      pushStep(node, { output: node.data.variableName ? String(variables[node.data.variableName] ?? "") : undefined });
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "webhook") {
      const startedAt = Date.now();
      let stepError: string | undefined;
      if (node.data.webhookUrl) {
        try {
          const res = await safeFetch(node.data.webhookUrl, {
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
          if (node.data.variableName) setVar(variables, node.data.variableName, value);
        } catch (err) {
          // um webhook falhando não deve travar o fluxo inteiro
          stepError = err instanceof Error ? err.message : String(err);
        }
      }
      pushStep(node, { error: stepError }, startedAt);
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "http") {
      const startedAt = Date.now();
      const result = await performHttpRequest(node.data, variables);
      if (node.data.variableName) setVar(variables, node.data.variableName, result.value);
      pushStep(node, { output: result.error ? undefined : JSON.stringify(result.value ?? null), error: result.error }, startedAt);
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "email") {
      const startedAt = Date.now();
      const apiKey = node.data.emailCredentialId ? await getCredentialSecret(node.data.emailCredentialId) : null;
      let stepError: string | undefined;
      if (!apiKey) {
        stepError = "Credencial Resend não configurada nesse bloco.";
      } else {
        const result = await sendEmail({
          apiKey,
          from: interpolate(node.data.emailFrom ?? "", variables),
          to: interpolate(node.data.emailTo ?? "", variables),
          subject: interpolate(node.data.emailSubject ?? "", variables),
          html: interpolate(node.data.emailBody ?? "", variables),
        });
        if (!result.ok) stepError = result.error;
      }
      pushStep(node, { error: stepError, output: stepError ? undefined: "e-mail enviado" }, startedAt);
      currentId = nextNodeId(edges, node.id);
      continue;
    }

    if (kind === "ai-agent") {
      const startedAt = Date.now();
      const reply = await runAiAgent(node, agent.id, input.text ?? "", variables, nodes, edges, conversation.id);
      if (reply.text) messages.push({ text: reply.text });
      pushStep(node, { output: reply.text ?? undefined, error: reply.error }, startedAt);
      currentId = node.id; // fica "alugado" pra IA nativa até o contato parar de responder
      break;
    }

    if (kind === "agent") {
      const startedAt = Date.now();
      const conversationId = `${input.channel}:${input.contactId}`;
      const reply = await callAgentWebhook(agent, input.text ?? "", conversationId, variables, input.lang);
      if (reply) messages.push({ text: reply });
      pushStep(node, { output: reply ?? undefined, error: reply ? undefined : "sem resposta do webhook" }, startedAt);
      currentId = node.id; // fica "alugado" pra IA livre até o contato parar de responder
      break;
    }

    if (kind === "human") {
      if (node.data.detail) messages.push({ text: interpolate(node.data.detail, variables) });
      pushStep(node);
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
      pushStep(node, { output: `até ${variables.__wait_until}` });
      currentId = node.id;
      break;
    }

    if (kind === "end") {
      if (node.data.detail) messages.push({ text: interpolate(node.data.detail, variables) });
      pushStep(node);
      status = "ended";
      currentId = null;
      break;
    }

    // Tipo desconhecido (ex: "start" alcançado de novo) — só segue em frente.
    currentId = nextNodeId(edges, node.id);
  }

  return finish();
}
