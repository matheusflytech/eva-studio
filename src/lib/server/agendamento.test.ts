import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  messageTemplate: { findFirst: vi.fn() },
  conversation: { findUnique: vi.fn() },
  broadcast: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  validarHorario,
  criarMensagemAgendada,
  cancelarAgendado,
  reagendar,
} from "./agendamento";

const H = 60 * 60 * 1000;
const agora = new Date("2026-10-20T12:00:00.000Z");

describe("validarHorario", () => {
  it("aceita futuro razoável", () => {
    expect(validarHorario(new Date(agora.getTime() + H), agora)).toBeNull();
  });
  it("recusa inválida, passado e longe demais", () => {
    expect(validarHorario(new Date("x"), agora)).toMatch(/inválid/i);
    expect(validarHorario(new Date(agora.getTime() - 1000), agora)).toMatch(/passou|futuro/i);
    expect(validarHorario(new Date(agora.getTime() + 30 * 1000), agora)).toMatch(/futuro/i);
    expect(validarHorario(new Date(agora.getTime() + 100 * 24 * H), agora)).toMatch(/90 dias/);
  });
});

describe("criarMensagemAgendada", () => {
  const base = {
    orgId: "o1",
    userId: "u1",
    agentId: "a1",
    channel: "whatsapp_meta",
    to: "5511999990001",
    contactRecordId: "c1",
    dealId: "d1",
    text: "Bom dia, {nome}!",
    templateId: null as string | null,
    quando: new Date(Date.now() + 2 * H),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.agent.findFirst.mockResolvedValue({ id: "a1", metaConnection: { agentId: "a1" }, telegramConnection: null });
    db.broadcast.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "b1", ...(data as object) }));
  });

  it("janela aberta na hora marcada: cria a avulsa agendada", async () => {
    db.conversation.findUnique.mockResolvedValue({ lastContactMessageAt: new Date(Date.now() - H) });
    const r = await criarMensagemAgendada(base);
    expect(r.ok).toBe(true);
    const data = db.broadcast.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      agentId: "a1",
      channel: "whatsapp_meta",
      kind: "single",
      audience: "manual",
      manualRecipients: ["5511999990001"],
      totalCount: 1,
      status: "scheduled",
      text: "Bom dia, {nome}!",
      templateId: null,
      contactRecordId: "c1",
      dealId: "d1",
      createdById: "u1",
    });
    expect(data.scheduledAt).toEqual(base.quando);
  });

  it("WhatsApp oficial fora da janela sem modelo: recusa", async () => {
    db.conversation.findUnique.mockResolvedValue({ lastContactMessageAt: new Date(Date.now() - 23 * H) });
    const r = await criarMensagemAgendada(base);
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.erro).toMatch(/modelo aprovado/i);
    expect(db.broadcast.create).not.toHaveBeenCalled();
  });

  it("fora da janela com modelo aprovado: aceita e guarda o modelo", async () => {
    db.conversation.findUnique.mockResolvedValue(null);
    db.messageTemplate.findFirst.mockResolvedValue({ id: "t1", metaTemplateName: "lembrete", bodyText: "Lembrete {nome}" });
    const r = await criarMensagemAgendada({ ...base, text: "", templateId: "t1" });
    expect(r.ok).toBe(true);
    expect(db.broadcast.create.mock.calls[0][0].data).toMatchObject({ templateId: "t1", text: "Lembrete {nome}" });
  });

  it("modelo sem nome da Meta não serve para o canal oficial", async () => {
    db.messageTemplate.findFirst.mockResolvedValue({ id: "t1", metaTemplateName: "", bodyText: "x" });
    const r = await criarMensagemAgendada({ ...base, templateId: "t1" });
    expect(r.ok).toBe(false);
  });

  it("hora no passado: recusa", async () => {
    const r = await criarMensagemAgendada({ ...base, quando: new Date(Date.now() - H) });
    expect(r.ok).toBe(false);
  });

  it("agente de outra organização: 404", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    const r = await criarMensagemAgendada(base);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("canal sem disparo (Instagram): recusa", async () => {
    const r = await criarMensagemAgendada({ ...base, channel: "instagram" });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("WhatsApp QR não tem janela: cria direto", async () => {
    const r = await criarMensagemAgendada({ ...base, channel: "whatsapp_qr", to: "5511999990001@s.whatsapp.net" });
    expect(r.ok).toBe(true);
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });
});

describe("cancelarAgendado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("só cancela enquanto está agendado, dentro da organização", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    expect(await cancelarAgendado("b1", "o1")).toEqual({ ok: true });
    expect(db.broadcast.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "scheduled", agent: { orgId: "o1" } },
      data: { status: "canceled" },
    });
  });

  it("já começou: explica em vez de fingir que cancelou", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    db.broadcast.findFirst.mockResolvedValue({ status: "sending" });
    const r = await cancelarAgendado("b1", "o1");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("não existe (ou é de outra organização): 404", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    db.broadcast.findFirst.mockResolvedValue(null);
    expect(await cancelarAgendado("b1", "o1")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("reagendar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muda a hora só enquanto está agendado", async () => {
    const quando = new Date(Date.now() + 3 * H);
    db.broadcast.findFirst.mockResolvedValue({
      id: "b1", status: "scheduled", kind: "campaign", channel: "whatsapp_qr", templateId: null, agentId: "a1", manualRecipients: [],
    });
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    expect(await reagendar("b1", "o1", quando)).toEqual({ ok: true });
    expect(db.broadcast.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "scheduled", agent: { orgId: "o1" } },
      data: { scheduledAt: quando },
    });
  });

  it("avulsa no WhatsApp oficial: confere a janela na hora nova", async () => {
    db.broadcast.findFirst.mockResolvedValue({
      id: "b1", status: "scheduled", kind: "single", channel: "whatsapp_meta", templateId: null, agentId: "a1",
      manualRecipients: ["5511999990001"],
    });
    db.conversation.findUnique.mockResolvedValue({ lastContactMessageAt: new Date(Date.now() - H) });
    const r = await reagendar("b1", "o1", new Date(Date.now() + 30 * H));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(db.broadcast.updateMany).not.toHaveBeenCalled();
  });

  it("hora inválida", async () => {
    const r = await reagendar("b1", "o1", new Date(Date.now() - H));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("já saiu: 409", async () => {
    db.broadcast.findFirst.mockResolvedValue({ id: "b1", status: "done", kind: "campaign", channel: "whatsapp_qr" });
    const r = await reagendar("b1", "o1", new Date(Date.now() + H));
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});
