import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
}));
const leads = vi.hoisted(() => ({ marcarComoLead: vi.fn() }));
const defs = vi.hoisted(() => ({ carregarDefinicoes: vi.fn(async (): Promise<unknown[]> => []) }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => leads);
vi.mock("@/lib/server/custom-fields", () => defs);

import { advanceConversation } from "./flow-engine";

function fluxo(capture: Record<string, unknown>, comSaidaInvalida = true) {
  return {
    agentId: "a1",
    nodes: [
      { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
      { id: "cap", position: { x: 0, y: 0 }, data: { iconKey: "capture", label: "Pergunta", detail: "Qual seu e-mail?", ...capture } },
      { id: "ok", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Ok", detail: "Valeu, {email}!" } },
      { id: "falhou", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Falhou", detail: "Sem problema, seguimos." } },
    ],
    edges: [
      { id: "e1", source: "start", target: "cap" },
      ...(comSaidaInvalida ? [{ id: "e3", source: "cap", sourceHandle: "invalido", target: "falhou" }] : []),
      { id: "e2", source: "cap", target: "ok" },
    ],
  };
}

const base = { agentId: "a1", channel: "instagram", contactId: "IG1" };
const parado = (vars: Record<string, unknown> = {}) => ({
  id: "c1", status: "active", currentNodeId: "cap", variables: vars, lastContactMessageAt: null, contactRecordId: null,
});
const gravado = () => db.conversation.update.mock.calls.at(-1)?.[0]?.data;

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1" });
  db.conversation.upsert.mockResolvedValue(parado());
});

describe("Captura validada", () => {
  it("e-mail válido: guarda normalizado, segue pela saída padrão e marca lead", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: " ANA@X.COM " });
    expect(r.messages.map((m) => m.text)).toEqual(["Valeu, ana@x.com!"]);
    expect(gravado().variables).toMatchObject({ email: "ana@x.com" });
    expect(leads.marcarComoLead).toHaveBeenCalledWith("contato-1", { agentId: "a1", channel: "instagram" });
  });

  it("e-mail inválido: pede de novo com a mensagem do tipo e conta a tentativa", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: "ana@" });
    expect(r.messages[0].text).toContain("e-mail não parece certo");
    expect(gravado()).toMatchObject({ currentNodeId: "cap", variables: { __capture_tries: 1 } });
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });

  it("mensagem de erro personalizada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureErrorMessage: "Manda um e-mail de verdade 🙂" }));
    const r = await advanceConversation({ ...base, text: "nada" });
    expect(r.messages[0].text).toBe("Manda um e-mail de verdade 🙂");
  });

  it("estourou as tentativas: sai pela saída 'não respondeu certo' sem guardar", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureMaxRetries: 2 }));
    db.conversation.upsert.mockResolvedValue(parado({ __capture_tries: 2 }));
    const r = await advanceConversation({ ...base, text: "ainda errado" });
    expect(r.messages.map((m) => m.text)).toEqual(["Sem problema, seguimos."]);
    expect(gravado().variables).not.toHaveProperty("email");
    expect(gravado().variables).not.toHaveProperty("__capture_tries");
  });

  it("estourou e o bloco não tem saída inválida: segue pela padrão sem guardar", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureMaxRetries: 0 }, false));
    const r = await advanceConversation({ ...base, text: "errado" });
    // interpolate troca variável ausente por "" (flow-engine.ts:83)
    expect(r.messages.map((m) => m.text)).toEqual(["Valeu, !"]);
  });

  it("opcional + 'pular': segue pela padrão sem guardar e sem marcar lead", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureRequired: false }));
    await advanceConversation({ ...base, text: "Pular" });
    expect(gravado().variables).not.toHaveProperty("email");
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });

  it("obrigatório: 'pular' é tratado como resposta inválida", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: "pular" });
    expect(gravado().currentNodeId).toBe("cap");
    expect(r.messages[0].text).toContain("e-mail");
  });

  it("campo do contato usa a definição do campo", async () => {
    defs.carregarDefinicoes.mockResolvedValue([{ key: "consumo", type: "number", label: "Consumo", options: [] }]);
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "custom", captureCustomKey: "consumo" }));
    await advanceConversation({ ...base, text: "1.200" });
    expect(gravado().variables).toMatchObject({ consumo: 1200 });
    expect(defs.carregarDefinicoes).toHaveBeenCalledWith("o1", "contact");
  });

  it("texto livre (padrão antigo) não muda nada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ variableName: "resposta" }));
    await advanceConversation({ ...base, text: "qualquer coisa" });
    expect(gravado().variables).toMatchObject({ resposta: "qualquer coisa" });
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });
});
