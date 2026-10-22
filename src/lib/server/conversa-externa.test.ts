import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { upsert: vi.fn(), update: vi.fn() },
  contact: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
const caixa = vi.hoisted(() => ({ registrarMensagens: vi.fn() }));
const leads = vi.hoisted(() => ({ marcarComoLead: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => caixa);
vi.mock("@/lib/server/leads", () => leads);

import { registrarTrocaExterna, sinaisDaTroca } from "./conversa-externa";

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.upsert.mockResolvedValue({ id: "cv1", contactRecordId: null });
  db.contact.create.mockResolvedValue({ id: "c1" });
});

describe("sinais da troca", () => {
  it("e-mail, telefone e botão de compra", () => {
    expect(sinaisDaTroca({ message: "meu email é Ana@Exemplo.com", reply: "" })).toEqual({ email: "ana@exemplo.com", telefone: null, interesse: null });
    expect(sinaisDaTroca({ message: "me chama no (11) 98765-4321", reply: "" }).telefone).toBe("11987654321");
    expect(sinaisDaTroca({ message: "quero entrar", reply: "Vale o anual.\n[[ANUAL]]" }).interesse).toBe("anual");
    expect(sinaisDaTroca({ message: "quanto custa? 2026", reply: "R$57 por mês" })).toEqual({ email: null, telefone: null, interesse: null });
  });
});

describe("registrar troca de site externo", () => {
  it("grava a conversa do agente no canal website com as duas mensagens", async () => {
    const r = await registrarTrocaExterna("o1", "a1", { conversationId: "web_abc123", message: "oi", reply: "Olá!", lang: "pt" });
    expect(r).toEqual({ ok: true, conversaId: "cv1", lead: false, contatoId: null });
    expect(db.conversation.upsert.mock.calls[0][0].where).toEqual({ agentId_channel_contactId: { agentId: "a1", channel: "website", contactId: "web_abc123" } });
    expect(caixa.registrarMensagens.mock.calls).toEqual([["cv1", [{ role: "contact", text: "oi" }]], ["cv1", [{ role: "bot", text: "Olá!" }]]]);
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("interesse de compra: cria a ficha e marca lead no agente", async () => {
    const r = await registrarTrocaExterna("o1", "a1", { conversationId: "web_abc123", message: "quero assinar", reply: "Ótimo!\n[[ANUAL]]", lang: "pt" });
    expect(r).toMatchObject({ ok: true, lead: true, contatoId: "c1" });
    expect(db.contact.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", name: "Visitante do site", source: "site", customFields: { idioma: "pt", interesse: "plano anual" } });
    expect(leads.marcarComoLead).toHaveBeenCalledWith("c1", { agentId: "a1", channel: "website" });
  });

  it("ficha que já existe: só completa o e-mail vazio", async () => {
    db.conversation.upsert.mockResolvedValue({ id: "cv1", contactRecordId: "c9" });
    db.contact.findUnique.mockResolvedValue({ email: "", phone: "5511" });
    await registrarTrocaExterna("o1", "a1", { conversationId: "web_abc123", message: "ana@x.com", reply: "ok" });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c9" }, data: { email: "ana@x.com" } });
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("id inválido ou troca vazia: recusa", async () => {
    expect(await registrarTrocaExterna("o1", "a1", { conversationId: "x", message: "oi", reply: "" })).toMatchObject({ ok: false, status: 400 });
    expect(await registrarTrocaExterna("o1", "a1", { conversationId: "web_abc123", message: " ", reply: "" })).toMatchObject({ ok: false });
  });
});
