import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ agent: { findFirst: vi.fn(), findUnique: vi.fn() } }));
const motor = vi.hoisted(() => ({ advanceConversation: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrgId: vi.fn(async () => "o1") }));
vi.mock("@/lib/server/flow-engine", () => motor);
vi.mock("@/lib/server/canais/sem-agente", () => ({ registrarMensagemSemAgente: vi.fn() }));
// "Já visto" em memória, no lugar da tabela de rate limit.
const vistos = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/server/rate-limit", () => ({
  isFirstDelivery: async (id?: string) => {
    if (!id) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  },
  esquecerEntrega: async (id?: string) => {
    if (id) vistos.delete(id);
  },
}));

import { POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://eva.test/api/conversations/message", { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  vistos.clear();
  process.env.INTERNAL_API_SECRET = "segredo";
  db.agent.findUnique.mockResolvedValue({ orgId: "o1" });
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  motor.advanceConversation.mockResolvedValue({ messages: [], status: "active" });
});

describe("mensagem vinda do navegador", () => {
  it("canal de cliente de verdade é recusado (não injeta mensagem falsa)", async () => {
    const res = await post({ agentId: "a1", channel: "whatsapp_qr", contactId: "5511999999999@s.whatsapp.net", text: "oi" });
    expect(res.status).toBe(403);
    expect(motor.advanceConversation).not.toHaveBeenCalled();
  });

  it("Playground e prévia do Builder seguem funcionando", async () => {
    expect((await post({ agentId: "a1", channel: "playground", contactId: "p1", text: "oi" })).status).toBe(200);
    expect((await post({ agentId: "a1", channel: "builder_preview", contactId: "p2", text: "oi" })).status).toBe(200);
    expect(motor.advanceConversation).toHaveBeenCalledTimes(2);
  });
});

describe("mensagem vinda do worker", () => {
  const doWorker = { agentId: "a1", channel: "whatsapp_qr", contactId: "5511@s.whatsapp.net", text: "oi", externalId: "WA1" };
  const interno = { "x-internal-secret": "segredo" };

  it("a mesma mensagem reemitida pelo Baileys roda o fluxo uma vez só", async () => {
    await post(doWorker, interno);
    const repetida = await post(doWorker, interno);
    expect(await repetida.json()).toEqual({ messages: [] });
    expect(motor.advanceConversation).toHaveBeenCalledTimes(1);
  });

  it("se o app falha, a nova tentativa do worker é processada (não vira repetida)", async () => {
    motor.advanceConversation.mockRejectedValueOnce(new Error("pool timeout"));
    await expect(post(doWorker, interno)).rejects.toThrow("pool timeout");
    expect((await post(doWorker, interno)).status).toBe(200);
    expect(motor.advanceConversation).toHaveBeenCalledTimes(2);
  });
});
