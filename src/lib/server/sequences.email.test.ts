import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  sequenceEnrollment: { findMany: vi.fn(), update: vi.fn() },
  conversation: { findFirst: vi.fn() },
  contactChannel: { findFirst: vi.fn() },
  messageTemplate: { findFirst: vi.fn() },
}));
const email = vi.hoisted(() => ({ enviarEmailDoContrato: vi.fn() }));
const outbound = vi.hoisted(() => ({ deliverToContact: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/email/envio", () => email);
vi.mock("@/lib/server/outbound", () => outbound);
vi.mock("@/lib/server/contacts", () => ({ applyTag: vi.fn() }));

import { limparPassosDeSequencia, processDueEnrollments } from "./sequences";

const inscricao = (passos: { order: number; templateId: string | null; delayMinutes?: number }[]) => ({
  id: "en1",
  currentStep: 0,
  contact: { id: "c1", orgId: "o1", optIn: true, name: "Ana", email: "ana@x.com", phone: "", customFields: {} },
  sequence: {
    name: "Pós-venda",
    active: true,
    channel: "email",
    agentId: "a1",
    steps: passos.map((p) => ({ id: `s${p.order}`, text: "E-mail: x", applyTagId: null, delayMinutes: p.delayMinutes ?? 60, ...p })),
  },
});

beforeEach(() => vi.clearAllMocks());

describe("régua de e-mail", () => {
  it("manda o modelo do passo pelo domínio do contrato e agenda o próximo, sem canal de conversa", async () => {
    db.sequenceEnrollment.findMany.mockResolvedValue([inscricao([{ order: 1, templateId: "m1" }, { order: 2, templateId: "m2", delayMinutes: 1440 }])]);
    email.enviarEmailDoContrato.mockResolvedValue({ ok: true, envioId: "e1" });
    const r = await processDueEnrollments();
    expect(r.delivered).toBe(1);
    expect(email.enviarEmailDoContrato).toHaveBeenCalledWith("o1", { contactId: "c1", conteudo: { modeloId: "m1" }, origem: "regua", refId: "en1" });
    expect(db.contactChannel.findFirst).not.toHaveBeenCalled();
    expect(outbound.deliverToContact).not.toHaveBeenCalled();
    expect(db.sequenceEnrollment.update.mock.calls[0][0].data).toMatchObject({ currentStep: 1 });
  });

  it("pessoa descadastrada ou sem e-mail: sai da régua com o motivo", async () => {
    db.sequenceEnrollment.findMany.mockResolvedValue([inscricao([{ order: 1, templateId: "m1" }])]);
    email.enviarEmailDoContrato.mockResolvedValue({ ok: false, motivo: "suprimido", erro: "Este endereço não recebe mais e-mails" });
    const r = await processDueEnrollments();
    expect(r.stopped).toBe(1);
    expect(db.sequenceEnrollment.update.mock.calls[0][0].data).toMatchObject({ status: "stopped", stoppedReason: "Este endereço não recebe mais e-mails" });
  });

  it("problema do contrato (sem domínio): não pula o passo, tenta de novo depois", async () => {
    db.sequenceEnrollment.findMany.mockResolvedValue([inscricao([{ order: 1, templateId: "m1" }])]);
    email.enviarEmailDoContrato.mockResolvedValue({ ok: false, motivo: "sem_dominio", erro: "Verifique o domínio" });
    const r = await processDueEnrollments();
    expect(r.errors).toHaveLength(1);
    const data = db.sequenceEnrollment.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.nextRunAt).toBeInstanceOf(Date);
  });

  it("limpeza: em régua de e-mail o passo vale pelo modelo, mesmo sem texto", () => {
    const passos = [{ text: "", templateId: "m1" }, { text: "", templateId: null }];
    expect(limparPassosDeSequencia(passos, "email")).toHaveLength(1);
    expect(limparPassosDeSequencia(passos)).toHaveLength(0);
  });
});
