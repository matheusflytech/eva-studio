import { describe, it, expect, vi, beforeEach } from "vitest";

// Banco e efeitos colaterais simulados: aqui só interessa a decisão do motor
// (qual mensagem sai, onde a conversa fica), não a gravação de verdade.
const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({
  registrarMensagens: vi.fn(),
  agentePausado: (status: string) => status === "waiting_human" || status === "human",
}));
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => null) }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));

import { advanceConversation } from "./flow-engine";

const nodes = [
  { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
  { id: "boas", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Boas-vindas", detail: "Bem-vindo" } },
  { id: "cap", position: { x: 0, y: 0 }, data: { iconKey: "capture", label: "E-mail", detail: "Seu e-mail?", variableName: "email" } },
  { id: "promo", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Promo", detail: "Promo ativa" } },
];
const edges = [
  { id: "e1", source: "start", target: "boas" },
  { id: "e2", source: "boas", target: "cap" },
];

let seq = 0;
function trigger(p: Record<string, unknown>) {
  seq += 1;
  return {
    id: `t${seq}`,
    name: `Gatilho ${seq}`,
    kind: "dm_keyword",
    channels: [],
    matchMode: "exact",
    keywords: ["promo"],
    storyId: "",
    includeReactions: true,
    replyText: "",
    targetNodeId: "",
    priority: 0,
    active: true,
    createdAt: new Date(2026, 0, seq),
    ...p,
  };
}

function conversa(p: Record<string, unknown> = {}) {
  return {
    id: "c1",
    status: "active",
    currentNodeId: null,
    variables: {},
    lastContactMessageAt: null,
    contactRecordId: null,
    ...p,
  };
}

const base = { agentId: "a1", channel: "instagram", contactId: "IGSID_1" };

function nodoGravado(): string | null {
  const call = db.conversation.update.mock.calls.at(-1)?.[0];
  return call?.data?.currentNodeId ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", outboundUrl: "https://n8n.example/hook" });
  db.agentFlow.findUnique.mockResolvedValue({ agentId: "a1", nodes, edges });
  db.conversation.upsert.mockResolvedValue(conversa());
  db.agentTrigger.findMany.mockResolvedValue([]);
});

describe("advanceConversation com gatilhos", () => {
  it("sem gatilho que case, segue o fluxo padrão", async () => {
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Bem-vindo", "Seu e-mail?"]);
    expect(nodoGravado()).toBe("cap");
  });

  it("gatilho só com resposta: responde e não mexe na conversa", async () => {
    db.agentTrigger.findMany.mockResolvedValue([trigger({ replyText: "Cupom EVA10" })]);
    const r = await advanceConversation({ ...base, text: "Promo" });
    expect(r.messages.map((m) => m.text)).toEqual(["Cupom EVA10"]);
    expect(nodoGravado()).toBeNull();
    expect(db.agentTrigger.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t" + seq }, data: expect.objectContaining({ triggerCount: { increment: 1 } }) })
    );
  });

  it("gatilho com bloco de destino: responde e executa o bloco", async () => {
    db.agentTrigger.findMany.mockResolvedValue([trigger({ replyText: "Cupom EVA10", targetNodeId: "promo" })]);
    const r = await advanceConversation({ ...base, text: "promo" });
    expect(r.messages.map((m) => m.text)).toEqual(["Cupom EVA10", "Promo ativa"]);
  });

  it("conversa parada numa Captura não é sequestrada por palavra-chave", async () => {
    db.conversation.upsert.mockResolvedValue(conversa({ currentNodeId: "cap" }));
    db.agentTrigger.findMany.mockResolvedValue([trigger({ replyText: "Cupom EVA10" })]);
    const r = await advanceConversation({ ...base, text: "promo" });
    expect(db.agentTrigger.findMany).not.toHaveBeenCalled();
    expect(r.messages.map((m) => m.text)).not.toContain("Cupom EVA10");
    const vars = db.conversation.update.mock.calls.at(-1)?.[0]?.data?.variables;
    expect(vars).toMatchObject({ email: "promo" });
  });

  it("menção em story sem gatilho: registra e não roda o fluxo", async () => {
    const r = await advanceConversation({ ...base, text: "[Menção no story]", event: { kind: "story_mention" } });
    expect(r.messages).toEqual([]);
    expect(nodoGravado()).toBeNull();
  });

  it("menção em story com gatilho: agradece", async () => {
    db.agentTrigger.findMany.mockResolvedValue([
      trigger({ kind: "story_mention", matchMode: "any", keywords: [], replyText: "Valeu pela menção! Cupom: EVA10" }),
    ]);
    const r = await advanceConversation({ ...base, text: "[Menção no story]", event: { kind: "story_mention" } });
    expect(r.messages.map((m) => m.text)).toEqual(["Valeu pela menção! Cupom: EVA10"]);
  });

  it("reação a story com includeReactions desligado: cai no fluxo, sem gatilho", async () => {
    db.agentTrigger.findMany.mockResolvedValue([
      trigger({ kind: "story_reply", matchMode: "any", keywords: [], includeReactions: false, replyText: "Obrigado!" }),
    ]);
    const r = await advanceConversation({
      ...base,
      text: "❤️",
      event: { kind: "story_reply", storyId: "S1", isReaction: true },
    });
    expect(r.messages.map((m) => m.text)).not.toContain("Obrigado!");
    expect(db.agentTrigger.update).not.toHaveBeenCalled();
  });

  it("agente sem fluxo salvo: menção não acorda o webhook do n8n", async () => {
    db.agentFlow.findUnique.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await advanceConversation({ ...base, text: "[Menção no story]", event: { kind: "story_mention" } });
    expect(r.messages).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("semResposta (grupo sem menção): registra a mensagem com o nome do grupo e não responde", async () => {
    const { registrarMensagens } = await import("@/lib/server/inbox");
    const { syncContactFromConversation } = await import("@/lib/server/contacts");
    const r = await advanceConversation({ ...base, text: "Ana: bom dia", semResposta: true, nomeDoContato: "Equipe Vendas" });
    expect(r.messages).toEqual([]);
    expect(registrarMensagens).toHaveBeenCalledWith(expect.any(String), [expect.objectContaining({ role: "contact", text: "Ana: bom dia" })]);
    expect(syncContactFromConversation).toHaveBeenCalledWith(expect.objectContaining({ nome: "Equipe Vendas", isInbound: true }));
  });

  it("agente sem fluxo salvo também fica calado com semResposta", async () => {
    db.agentFlow.findUnique.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await advanceConversation({ ...base, text: "oi", semResposta: true });
    expect(r.messages).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
