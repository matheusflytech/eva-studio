import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  agent: { create: vi.fn() },
  agentFlow: { create: vi.fn() },
  agentSubflow: { createMany: vi.fn() },
  agentVariable: { createMany: vi.fn() },
  agentTrigger: { createMany: vi.fn() },
  knowledgeDoc: { create: vi.fn() },
  $executeRaw: vi.fn(),
}));
const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { duplicateAgent } from "./duplicate-agent";

const origem = {
  id: "a1",
  orgId: "o1",
  name: "Vendedor Virtual",
  description: "d",
  tone: "t",
  language: "Português",
  primaryChannel: "whatsapp",
  instructions: "Atenda.",
  guidelines: "",
  skills: [],
  tools: [],
  outboundUrl: "",
  status: "active",
  widgetEnabled: true,
  embeddingProvider: "openai",
  embeddingCredentialId: "cred1",
  embeddingModel: "text-embedding-3-small",
  flow: { agentId: "a1", nodes: [{ id: "n1" }, { id: "ir", data: { iconKey: "go-to-flow", targetFlowId: "f1" } }], edges: [] },
  subflows: [{ id: "f1", agentId: "a1", name: "Vendas", keywords: ["preço"], position: 0, nodes: [{ id: "s1" }], edges: [] }],
  variables: [{ id: "v1", agentId: "a1", name: "cpf", unit: "" }],
  triggers: [
    {
      id: "t1", agentId: "a1", name: "Promo", kind: "dm_keyword", channels: [], matchMode: "contains",
      keywords: ["promo"], storyId: "", includeReactions: true, replyText: "", targetNodeId: "n1",
      priority: 0, active: true, triggerCount: 42, lastTriggeredAt: new Date(),
    },
  ],
  knowledgeBase: [{ id: "d1", agentId: "a1", fileName: "faq.pdf", sizeBytes: 10, mimeType: "application/pdf", content: "x" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.agent.create.mockResolvedValue({ id: "a2" });
  tx.knowledgeDoc.create.mockResolvedValue({ id: "d2" });
});

describe("duplicateAgent", () => {
  it("não acha agente de outro contrato", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect(await duplicateAgent("o1", "x")).toBeNull();
    expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x", orgId: "o1" } }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("copia tudo para o novo agente, pausado e sem widget", async () => {
    db.agent.findFirst.mockResolvedValue(origem);
    expect(await duplicateAgent("o1", "a1")).toEqual({ id: "a2" });

    const dados = tx.agent.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({ orgId: "o1", name: "Vendedor Virtual (cópia)", status: "paused", widgetEnabled: false, instructions: "Atenda." });
    expect(tx.agentFlow.create).toHaveBeenCalledWith({ data: { agentId: "a2", nodes: [{ id: "n1" }, expect.objectContaining({ id: "ir" })], edges: [] } });
    expect(tx.agentVariable.createMany).toHaveBeenCalledWith({ data: [{ agentId: "a2", name: "cpf", unit: "" }] });

    const gatilho = tx.agentTrigger.createMany.mock.calls[0][0].data[0];
    expect(gatilho).toMatchObject({ agentId: "a2", targetNodeId: "n1", keywords: ["promo"] });
    expect(gatilho).not.toHaveProperty("triggerCount");
    expect(gatilho).not.toHaveProperty("id");

    expect(tx.knowledgeDoc.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ agentId: "a2", fileName: "faq.pdf" }) }));
    // chunks: novo agente, novo doc, lidos do doc antigo
    expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual(["a2", "d2", "d1"]);
  });

  it("fluxos extras ganham id novo e o Ir para fluxo aponta para a cópia", async () => {
    db.agent.findFirst.mockResolvedValue(origem);
    await duplicateAgent("o1", "a1");
    const copia = tx.agentSubflow.createMany.mock.calls[0][0].data[0];
    expect(copia).toMatchObject({ agentId: "a2", name: "Vendas", keywords: ["preço"] });
    expect(copia.id).not.toBe("f1");
    const ir = tx.agentFlow.create.mock.calls[0][0].data.nodes.find((n: { id: string }) => n.id === "ir");
    expect(ir.data.targetFlowId).toBe(copia.id);
  });
});
