import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  conversation: { upsert: vi.fn() },
  messageTemplate: { findFirst: vi.fn() },
  message: { update: vi.fn() },
}));
const saida = vi.hoisted(() => ({ deliverToContact: vi.fn() }));
const caixa = vi.hoisted(() => ({
  CANAIS_RESPONDIVEIS: new Set(["whatsapp_meta", "whatsapp_qr", "telegram"]),
  janelaDeResposta: vi.fn(() => ({ restrita: false, aberta: true })),
  registrarMensagens: vi.fn(async () => [{ id: "m1" }]),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/outbound", () => saida);
vi.mock("@/lib/server/inbox", () => caixa);

import { enviarMensagemExterna, lerDestino } from "./mensagem-externa";

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.conversation.upsert.mockResolvedValue({ id: "c1", variables: { nome: "Ana" }, lastContactMessageAt: null });
  saida.deliverToContact.mockResolvedValue({ ok: true, queued: true, id: "q1" });
});

describe("lerDestino", () => {
  it("conversation_id do bloco (canal:contato) ou canal + to", () => {
    expect(lerDestino({ conversationId: "whatsapp_qr:5511999" })).toEqual({ channel: "whatsapp_qr", to: "5511999" });
    expect(lerDestino({ channel: "telegram", to: "42" })).toEqual({ channel: "telegram", to: "42" });
    expect(lerDestino({ conversationId: "semcanal" })).toBeNull();
  });
});

describe("enviarMensagemExterna", () => {
  it("manda pelo canal do agente e grava na conversa como do agente", async () => {
    const r = await enviarMensagemExterna("o1", { agentId: "a1", conversationId: "whatsapp_qr:5511999", text: "Saiu para entrega" });
    expect(r).toEqual({ ok: true, messageId: "m1", conversationId: "whatsapp_qr:5511999", status: "queued" });
    expect(caixa.registrarMensagens).toHaveBeenCalledWith("c1", [{ role: "bot", text: "Saiu para entrega", deliveryStatus: "sending" }]);
    expect(saida.deliverToContact).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", channel: "whatsapp_qr", to: "5511999" }));
  });

  it("agente de outro contrato: 404 sem enviar", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    const r = await enviarMensagemExterna("o1", { agentId: "x", channel: "telegram", to: "1", text: "oi" });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(saida.deliverToContact).not.toHaveBeenCalled();
  });

  it("janela de 24h fechada sem modelo: 409", async () => {
    caixa.janelaDeResposta.mockReturnValueOnce({ restrita: true, aberta: false });
    const r = await enviarMensagemExterna("o1", { agentId: "a1", channel: "whatsapp_meta", to: "5511", text: "oi" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "window_closed" });
  });

  it("modelo: preenche com as variáveis mandadas por cima das da conversa", async () => {
    db.messageTemplate.findFirst.mockResolvedValue({ metaTemplateName: "pedido", metaLanguageCode: "pt_BR", variableOrder: ["nome", "pedido"], bodyText: "Oi {nome}, pedido {pedido}" });
    saida.deliverToContact.mockResolvedValue({ ok: true, id: "w1" });
    const r = await enviarMensagemExterna("o1", { agentId: "a1", channel: "whatsapp_meta", to: "5511", templateId: "t1", variables: { pedido: "123" } });
    expect(r).toMatchObject({ ok: true, status: "sent" });
    expect(saida.deliverToContact.mock.calls[0][0]).toMatchObject({ text: "Oi Ana, pedido 123", template: { name: "pedido", parameters: ["Ana", "123"] } });
  });

  it("canal recusou: marca a mensagem como falha e devolve 502", async () => {
    saida.deliverToContact.mockResolvedValue({ ok: false, error: "Número inválido" });
    const r = await enviarMensagemExterna("o1", { agentId: "a1", channel: "telegram", to: "1", text: "oi" });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(db.message.update.mock.calls[0][0].data).toMatchObject({ deliveryStatus: "failed" });
  });
});
