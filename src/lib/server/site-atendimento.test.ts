import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  message: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
}));
const caixa = vi.hoisted(() => ({ registrarMensagens: vi.fn() }));
const saida = vi.hoisted(() => ({ deliverToContact: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/outbound", () => saida);
vi.mock("@/lib/server/conversas", () => ({
  CANAIS_DE_TESTE: ["playground", "builder_preview"],
  INCLUDE_MENSAGEM: {},
  serializarMensagens: vi.fn(async (l: { id: string }[]) => l),
}));
vi.mock("@/lib/server/inbox", async (original) => ({ ...(await original<typeof import("@/lib/server/inbox")>()), registrarMensagens: caixa.registrarMensagens }));

import { humanoNaConversa, mensagensDoAtendente } from "./site-atendimento";
import { responderComoAtendente } from "./responder";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o site busca o que o atendente escreveu", () => {
  it("só as do atendente depois do corte, mais se um humano está com a conversa", async () => {
    db.conversation.findUnique.mockResolvedValue({ id: "cv1", status: "human" });
    db.message.findMany.mockResolvedValue([{ id: "m1", text: "Oi, sou a Ana", createdAt: new Date("2026-10-22T12:00:01Z"), author: { name: "Ana" } }]);
    const r = await mensagensDoAtendente("a1", "site-live-x", "2026-10-22T12:00:00.000Z");
    expect(r).toEqual({ humano: true, messages: [{ id: "m1", text: "Oi, sou a Ana", autor: "Ana", createdAt: "2026-10-22T12:00:01.000Z" }] });
    expect(db.conversation.findUnique.mock.calls[0][0].where).toEqual({ agentId_channel_contactId: { agentId: "a1", channel: "website", contactId: "site-live-x" } });
    expect(db.message.findMany.mock.calls[0][0].where).toEqual({ conversationId: "cv1", role: "human", createdAt: { gt: new Date("2026-10-22T12:00:00.000Z") } });
  });

  it("sem corte (ou corte inválido): volta uma hora; conversa que não existe: nada", async () => {
    db.conversation.findUnique.mockResolvedValue({ id: "cv1", status: "active" });
    db.message.findMany.mockResolvedValue([]);
    const antes = Date.now();
    expect(await mensagensDoAtendente("a1", "x", "lixo")).toEqual({ humano: false, messages: [] });
    const corte = db.message.findMany.mock.calls[0][0].where.createdAt.gt as Date;
    expect(antes - corte.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);

    db.conversation.findUnique.mockResolvedValue(null);
    expect(await mensagensDoAtendente("a1", "x", null)).toEqual({ humano: false, messages: [] });
    expect(await humanoNaConversa("a1", "x")).toBe(false);
  });

  it("aguardando atendente também conta como humano (a IA fica quieta)", async () => {
    db.conversation.findUnique.mockResolvedValue({ status: "waiting_human" });
    expect(await humanoNaConversa("a1", "x")).toBe(true);
  });
});

describe("atendente responde no chat do site", () => {
  const conversa = { id: "cv1", channel: "website", contactId: "site-live-x", agentId: "a1", status: "waiting_human", assignedToId: null, assignedTo: null, contact: null, variables: {}, lastContactMessageAt: new Date() };

  it("grava como enviada e não tenta mandar para lugar nenhum", async () => {
    db.conversation.findFirst.mockResolvedValue(conversa);
    caixa.registrarMensagens.mockResolvedValue([{ id: "m1" }]);
    db.message.findUniqueOrThrow.mockResolvedValue({ id: "m1" });
    const r = await responderComoAtendente({ conversationId: "cv1", orgId: "o1", userId: "u1", text: "Oi, sou a Ana" });
    expect(r.ok).toBe(true);
    expect(db.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "human", assignedToId: "u1" }) }));
    expect(caixa.registrarMensagens.mock.calls[0][1][0]).toMatchObject({ role: "human", text: "Oi, sou a Ana", deliveryStatus: "sent" });
    expect(saida.deliverToContact).not.toHaveBeenCalled();
  });

  it("arquivo não: o chat do site só mostra texto", async () => {
    db.conversation.findFirst.mockResolvedValue(conversa);
    const r = await responderComoAtendente({
      conversationId: "cv1",
      orgId: "o1",
      userId: "u1",
      text: "",
      attachment: { path: "o1/a.png", type: "image", mime: "image/png" },
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(caixa.registrarMensagens).not.toHaveBeenCalled();
  });
});
