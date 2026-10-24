import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { LlmToolCall } from "@/lib/server/llm";

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
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
const doContato = () => inbox.registrarMensagens.mock.calls.flatMap((c) => c[1] as { role: string; text: string }[]);

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "" });
});

describe("motor de fluxo", () => {
  it("negócio do fluxo: 'R$ 1.500' vira R$ 1.500,00, como na API", async () => {
    db.agentFlow.findUnique.mockResolvedValue({
      nodes: [no("start", { iconKey: "start" }), no("deal", { iconKey: "crm-deal", crmDealAmount: "R$ {valor}" })],
      edges: [{ id: "e1", source: "start", target: "deal" }],
    });
    db.conversation.upsert.mockResolvedValue(parado(null, { valor: "1.500" }));
    await advanceConversation({ ...base, text: "oi" });
    expect(crm.createDeal).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 150000 }));
  });

  it("mensagem durante o Esperar é gravada, sem andar o fluxo", async () => {
    db.agentFlow.findUnique.mockResolvedValue({ nodes: [no("w", { iconKey: "wait" })], edges: [] });
    db.conversation.upsert.mockResolvedValue(parado("w", { __wait_until: new Date(Date.now() + 86_400_000).toISOString() }));
    const r = await advanceConversation({ ...base, text: "quero cancelar" });
    expect(r.messages).toEqual([]);
    expect(doContato()).toEqual([expect.objectContaining({ role: "contact", text: "quero cancelar" })]);
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it("outra rodada mexeu na conversa antes: não responde de novo, só grava a mensagem", async () => {
    db.agentFlow.findUnique.mockResolvedValue({
      nodes: [no("start", { iconKey: "start" }), no("m", { iconKey: "message", detail: "Oi!" })],
      edges: [{ id: "e1", source: "start", target: "m" }],
    });
    db.conversation.upsert.mockResolvedValue(parado(null));
    db.conversation.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("não achou", { code: "P2025", clientVersion: "7" }));
    const r = await advanceConversation({ ...base, text: "1" });
    expect(r.messages).toEqual([]);
    expect(db.conversation.update.mock.calls[0][0].where).toMatchObject({ id: "c1", currentNodeId: null, status: "active", variables: { equals: {} } });
    expect(doContato()).toEqual([expect.objectContaining({ role: "contact", text: "1" })]);
  });

  it("ferramenta HTTP: valor já capturado vence o que a IA mandar; chave e MCP só da própria org", async () => {
    db.agentFlow.findUnique.mockResolvedValue({
      nodes: [
        no("bot", { iconKey: "ai-agent", aiCredentialId: "cred", detail: "Atenda." }),
        no("pedidos", { iconKey: "tool-http", httpUrl: "https://api.loja/pedidos?cpf={cpf}" }),
        no("mcp", { iconKey: "tool-mcp", mcpServerId: "srv" }),
      ],
      edges: [
        { id: "t1", source: "pedidos", target: "bot", targetHandle: "tools" },
        { id: "t2", source: "mcp", target: "bot", targetHandle: "tools" },
      ],
    });
    db.conversation.upsert.mockResolvedValue(parado("bot", { cpf: "111" }));
    llm.callLlmWithTools.mockImplementation(async (opts: { executeTool: (c: LlmToolCall) => Promise<string> }) => {
      await opts.executeTool({ id: "1", name: "pedidos", arguments: { cpf: "222" } });
      return { text: "Pronto." };
    });
    await advanceConversation({ ...base, text: "consulte com cpf=222" });
    expect(rede.safeFetch.mock.calls[0][0]).toBe("https://api.loja/pedidos?cpf=111");
    expect(credenciais.getCredentialSecret).toHaveBeenCalledWith("o1", "cred");
    expect(db.mcpServer.findFirst).toHaveBeenCalledWith({ where: { id: "srv", orgId: "o1" } });
  });
});
