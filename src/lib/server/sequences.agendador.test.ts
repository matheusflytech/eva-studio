import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  sequence: { findMany: vi.fn() },
  deal: { findMany: vi.fn(async (_arg: { where: Record<string, unknown> }) => [] as unknown[]) },
  sequenceEnrollment: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  contactChannel: { findFirst: vi.fn() },
}));
const outbound = vi.hoisted(() => ({ deliverToContact: vi.fn() }));
const contatos = vi.hoisted(() => ({ applyTag: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/email/envio", () => ({ enviarEmailDoContrato: vi.fn() }));
vi.mock("@/lib/server/outbound", () => outbound);
vi.mock("@/lib/server/contacts", () => contatos);

import { enrollByDealStage, processDueEnrollments } from "./sequences";

const vence = new Date("2026-10-24T12:00:00.000Z");
const inscricao = () => ({
  id: "en1",
  currentStep: 0,
  nextRunAt: vence,
  contact: { id: "c1", orgId: "o1", optIn: true, name: "Ana", email: "", phone: "", customFields: {} },
  sequence: {
    name: "Boas-vindas",
    active: true,
    channel: "whatsapp_qr",
    agentId: "a1",
    steps: [
      { order: 1, text: "Oi", templateId: null, applyTagId: "tag-apagada", delayMinutes: 0 },
      { order: 2, text: "Tudo bem?", templateId: null, applyTagId: null, delayMinutes: 60 },
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.sequenceEnrollment.findMany.mockResolvedValue([inscricao()]);
  db.sequenceEnrollment.updateMany.mockResolvedValue({ count: 1 });
  db.contactChannel.findFirst.mockResolvedValue({ externalId: "5511999990001" });
  outbound.deliverToContact.mockResolvedValue({ ok: true, queued: true });
});

describe("passo da régua", () => {
  it("etiqueta apagada: a inscrição avança mesmo assim e a rodada não quebra", async () => {
    contatos.applyTag.mockRejectedValue(Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" }));

    const r = await processDueEnrollments();

    expect(r.delivered).toBe(1);
    expect(db.sequenceEnrollment.update.mock.calls[0][0].data).toMatchObject({ currentStep: 1 });
  });

  it("reserva a inscrição antes de enviar; se outra rodada já reservou, não envia de novo", async () => {
    db.sequenceEnrollment.updateMany.mockResolvedValue({ count: 0 });

    const r = await processDueEnrollments();

    expect(db.sequenceEnrollment.updateMany.mock.calls[0][0].where).toEqual({ id: "en1", status: "active", nextRunAt: vence });
    expect(outbound.deliverToContact).not.toHaveBeenCalled();
    expect(r.processed).toBe(0);
  });
});

describe("gatilho por etapa", () => {
  it("só busca negócios com contato que ainda não está na régua", async () => {
    db.sequence.findMany.mockResolvedValue([{ id: "s1", triggerStageId: "st1", triggerStageDays: 0, allowReentry: true }]);

    await enrollByDealStage();

    const where = db.deal.findMany.mock.calls[0][0].where;
    expect(where.contacts).toEqual({
      some: { contact: { optIn: true, enrollments: { none: { sequenceId: "s1", status: "active" } } } },
    });
  });
});
