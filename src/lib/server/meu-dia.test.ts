import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  taskDetail: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({ ctxPode: () => true, requirePermission: vi.fn() }));
vi.mock("@/lib/server/filtro-crm", () => ({ whereDeParadosDoContrato: vi.fn(async () => ({ id: "parado" })) }));

import { carregarMeuDia } from "./meu-dia";

// Terça, 20/10/2026, 10:00 em SP.
const AGORA = new Date("2026-10-20T13:00:00Z");
const ctx = { userId: "u1", orgId: "o1", role: "agent" as const };

beforeEach(() => {
  vi.clearAllMocks();
  db.task.findMany.mockResolvedValue([]);
  db.taskDetail.findMany.mockResolvedValue([]);
  db.conversation.findMany.mockResolvedValue([]);
  db.contact.findMany.mockResolvedValue([]);
  db.deal.findMany.mockResolvedValue([]);
  db.pipelineStage.findMany.mockResolvedValue([]);
});

describe("Meu dia no servidor", () => {
  it("Responder só para mensagem do cliente ainda não lida", async () => {
    const base = { lastMessageText: "oi", contactId: "5521", contact: { id: "c1", name: "Ana", phone: "5521", email: "" } };
    db.conversation.findMany.mockResolvedValue([
      { ...base, id: "nao-lida", readAt: null, lastMessageAt: new Date("2026-10-20T12:00:00Z"), lastContactMessageAt: new Date("2026-10-20T12:00:00Z") },
      { ...base, id: "lida", readAt: new Date("2026-10-20T12:30:00Z"), lastMessageAt: new Date("2026-10-20T12:00:00Z"), lastContactMessageAt: new Date("2026-10-20T12:00:00Z") },
    ]);
    const dia = await carregarMeuDia(ctx, AGORA);
    const ids = [...dia.agora, ...dia.provavelmenteAmanha].map((i) => i.id);
    expect(ids).toEqual(["responder:nao-lida"]);
    expect(dia.agora[0].contexto.conversaId).toBe("nao-lida");
    expect(dia.resumo.aguardandoResposta).toBe(1);
  });

  it("colunas de lead ausentes não derrubam o Meu dia", async () => {
    db.contact.findMany.mockRejectedValue(new Error('column "leadStage" does not exist'));
    db.taskDetail.findMany.mockRejectedValue(new Error("relation eva_studio_task_details does not exist"));
    db.task.findMany.mockResolvedValue([
      {
        id: "t1",
        orgId: "o1",
        type: "outro",
        text: "Enviar proposta",
        dueAt: new Date("2026-10-19T13:00:00Z"),
        doneAt: null,
        createdAt: new Date("2026-10-01T12:00:00Z"),
        contactId: null,
        dealId: null,
        assignedToId: "u1",
        contact: null,
        deal: null,
        assignedTo: { id: "u1", name: "Eu" },
      },
    ]);
    const dia = await carregarMeuDia(ctx, AGORA);
    expect(dia.agora.map((i) => i.id)).toEqual(["t1"]);
    // tipo antigo aparece como "a fazer"; atrasada pontua
    expect(dia.agora[0].tipo).toBe("afazer");
    expect(dia.agora[0].tarefa?.overdue).toBe(true);
    expect(dia.resumo.atrasadas).toBe(1);
  });
});
