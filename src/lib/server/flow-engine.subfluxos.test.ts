import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentSubflow: { findMany: vi.fn(async () => []) },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
  message: { findMany: vi.fn(async () => []) },
  knowledgeDoc: { findMany: vi.fn(async () => []) },
  mcpServer: { findFirst: vi.fn(async () => null) },
}));
const inbox = vi.hoisted(() => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));
const rede = vi.hoisted(() => ({ safeFetch: vi.fn(async (_url: string) => ({ text: async () => "{}" })) }));
const credenciais = vi.hoisted(() => ({ getCredentialSecret: vi.fn(async () => "chave") }));
const crm = vi.hoisted(() => ({
  createDeal: vi.fn(async () => ({ id: "d1", name: "Negócio", pipelineId: "p1" })),
  preencherCamposDoNegocio: vi.fn(async () => ({ aplicados: 0, erros: [] })),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => inbox);
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => ({ marcarComoLead: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ carregarDefinicoes: vi.fn(async () => []) }));
vi.mock("@/lib/server/credentials", () => credenciais);
vi.mock("@/lib/server/llm", () => llm);
vi.mock("@/lib/server/ssrf", () => rede);
vi.mock("@/lib/server/knowledge-search", () => ({ searchKnowledgeBase: vi.fn(async () => []) }));
vi.mock("@/lib/server/ia/conexao", () => ({ passosDaConexao: vi.fn() }));
vi.mock("@/lib/server/ia/uso", () => ({ chavesNoLimite: vi.fn(async () => new Set<string>()), registrarUso: vi.fn() }));
vi.mock("@/lib/server/crm", () => crm);

import { advanceConversation } from "./flow-engine";

const base = { agentId: "a1", channel: "instagram", contactId: "IG1" };
const parado = (no: string | null, vars: Record<string, unknown> = {}) => ({
  id: "c1", status: "active", currentNodeId: no, variables: vars, lastContactMessageAt: null, contactRecordId: null,
});
const no = (id: string, data: Record<string, unknown>) => ({ id, position: { x: 0, y: 0 }, data: { label: id, ...data } });

const atualizado = () => db.conversation.update.mock.calls.at(-1)?.[0].data as { currentNodeId: string | null; currentFlowId: string | null; status: string };
const textos = (r: { messages: { text?: string }[] }) => r.messages.map((m) => m.text);

// Principal: Início → menu (botões) → "Vendas" leva ao fluxo de vendas.
const PRINCIPAL = {
  nodes: [
    no("start", { iconKey: "start" }),
    no("menu", { iconKey: "capture", detail: "Menu", options: [{ id: "v", label: "Vendas" }] }),
    no("ir", { iconKey: "go-to-flow", targetFlowId: "f-vendas" }),
  ],
  edges: [{ id: "e1", source: "start", target: "menu" }, { id: "e2", source: "menu", sourceHandle: "v", target: "ir" }],
};
const VENDAS = {
  id: "f-vendas",
  name: "Vendas",
  keywords: ["Orçamento"],
  nodes: [
    no("s2", { iconKey: "start" }),
    no("oi", { iconKey: "message", detail: "Bem-vindo às vendas" }),
    no("pergunta", { iconKey: "capture", detail: "Qual produto?" }),
    no("volta", { iconKey: "go-to-flow", targetFlowId: "main" }),
  ],
  edges: [{ id: "e3", source: "s2", target: "oi" }, { id: "e4", source: "oi", target: "pergunta" }, { id: "e5", source: "pergunta", target: "volta" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "" });
  db.agentFlow.findUnique.mockResolvedValue(PRINCIPAL);
  db.agentSubflow.findMany.mockResolvedValue([VENDAS] as never);
});

describe("vários fluxos (S4)", () => {
  it("Ir para fluxo: entra no começo do outro fluxo na mesma rodada e grava em qual fluxo está", async () => {
    db.conversation.upsert.mockResolvedValue({ ...parado("menu"), currentFlowId: null });
    const r = await advanceConversation({ ...base, optionId: "v" });
    expect(textos(r)).toEqual(["Bem-vindo às vendas", "Qual produto?"]);
    expect(atualizado()).toMatchObject({ currentNodeId: "pergunta", currentFlowId: "f-vendas" });
  });

  it("a próxima mensagem continua no fluxo em que a conversa parou; voltar ao principal reabre o menu", async () => {
    db.conversation.upsert.mockResolvedValue({ ...parado("pergunta"), currentFlowId: "f-vendas" });
    const r = await advanceConversation({ ...base, text: "camiseta" });
    expect(textos(r)).toEqual(["Menu"]);
    expect(atualizado()).toMatchObject({ currentNodeId: "menu", currentFlowId: null });
  });

  it("palavra-chave (sem acento nem maiúscula) leva ao fluxo de qualquer ponto; no meio da frase não", async () => {
    db.conversation.upsert.mockResolvedValue({ ...parado("menu"), currentFlowId: null });
    const r = await advanceConversation({ ...base, text: "  orcamento! " });
    expect(textos(r)).toEqual(["Bem-vindo às vendas", "Qual produto?"]);
    expect(atualizado()).toMatchObject({ currentFlowId: "f-vendas" });

    db.conversation.update.mockClear();
    db.conversation.upsert.mockResolvedValue({ ...parado("menu"), currentFlowId: null });
    const frase = await advanceConversation({ ...base, text: "quero um orçamento" });
    expect(textos(frase)).toEqual(["Menu"]); // opção não reconhecida: repete o menu
    expect(atualizado()).toMatchObject({ currentFlowId: null });
  });

  it("fluxo apagado com a conversa dentro: recomeça pelo principal", async () => {
    db.agentSubflow.findMany.mockResolvedValue([] as never);
    db.conversation.upsert.mockResolvedValue({ ...parado("pergunta"), currentFlowId: "f-apagado" });
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(textos(r)).toEqual(["Menu"]);
    expect(atualizado()).toMatchObject({ currentNodeId: "menu", currentFlowId: null });
  });

  it("Ir para fluxo sem destino (ou apagado) para a conversa ali, com erro na execução", async () => {
    db.agentSubflow.findMany.mockResolvedValue([] as never);
    db.conversation.upsert.mockResolvedValue({ ...parado("menu"), currentFlowId: null });
    const r = await advanceConversation({ ...base, optionId: "v" });
    expect(r.messages).toEqual([]);
    expect(atualizado()).toMatchObject({ currentNodeId: null, currentFlowId: null });
    const passos = db.flowExecution.create.mock.calls[0][0].data.steps as { nodeId: string; error?: string }[];
    expect(passos.find((p) => p.nodeId === "ir")?.error).toMatch(/não existe/);
  });
});
