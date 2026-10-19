import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  deal: { findFirst: vi.fn() },
  dealStageEvent: { findMany: vi.fn() },
  note: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { GET } from "./route";

const get = () => GET(new Request("http://x/api/deals/d1/linha-do-tempo"), { params: Promise.resolve({ dealId: "d1" }) });
const d = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.deal.findFirst.mockResolvedValue({
    id: "d1",
    createdAt: d("2026-10-01T12:00:00Z"),
    contacts: [{ contactId: "c1" }],
  });
  db.dealStageEvent.findMany.mockResolvedValue([
    { id: "e2", fromStageId: "s1", toStageId: "s2", origem: "fluxo", at: d("2026-10-05T12:00:00Z") },
    { id: "e1", fromStageId: null, toStageId: "s1", origem: "usuario", at: d("2026-10-01T12:00:00Z") },
  ]);
  db.pipelineStage.findMany.mockResolvedValue([
    { id: "s1", name: "Proposta", type: "open" },
    { id: "s2", name: "Negociação", type: "open" },
  ]);
  db.note.findMany.mockResolvedValue([
    { id: "n1", text: "Pediu desconto", createdAt: d("2026-10-03T12:00:00Z"), author: { name: "Ana" } },
  ]);
  db.task.findMany.mockResolvedValue([
    { id: "t1", type: "ligar", text: "Retornar", dueAt: null, doneAt: d("2026-10-06T12:00:00Z"), createdAt: d("2026-10-02T12:00:00Z") },
  ]);
  db.conversation.findMany.mockResolvedValue([
    {
      id: "cv1",
      channel: "whatsapp_meta",
      status: "human",
      createdAt: d("2026-10-04T12:00:00Z"),
      lastMessageAt: d("2026-10-07T12:00:00Z"),
      lastMessageText: "Oi",
      lastMessageRole: "contact",
      lastContactMessageAt: d("2026-10-07T12:00:00Z"),
      readAt: d("2026-10-06T12:00:00Z"),
      contact: { id: "c1", name: "Bia" },
      agent: { name: "Eva" },
    },
  ]);
});

describe("GET /api/deals/[dealId]/linha-do-tempo", () => {
  it("negócio de outra org → 404, sem consultar o resto", async () => {
    db.deal.findFirst.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(db.deal.findFirst.mock.calls[0][0].where).toEqual({ id: "d1", orgId: "org" });
    expect(db.note.findMany).not.toHaveBeenCalled();
    expect(db.conversation.findMany).not.toHaveBeenCalled();
  });

  it("cada consulta filtra pela org", async () => {
    await get();
    expect(db.dealStageEvent.findMany.mock.calls[0][0].where).toEqual({ dealId: "d1", orgId: "org" });
    expect(db.note.findMany.mock.calls[0][0].where).toEqual({ dealId: "d1", orgId: "org" });
    expect(db.task.findMany.mock.calls[0][0].where).toEqual({ dealId: "d1", orgId: "org" });
    const conv = db.conversation.findMany.mock.calls[0][0].where;
    expect(conv.contactRecordId).toEqual({ in: ["c1"] });
    expect(conv.agent).toEqual({ orgId: "org" });
    expect(conv.contact).toEqual({ orgId: "org" });
    expect(db.pipelineStage.findMany.mock.calls[0][0].where.pipeline).toEqual({ orgId: "org" });
  });

  it("junta os tipos e ordena do mais recente para o mais antigo", async () => {
    const body = await (await get()).json();
    expect(body.itens.map((i: { tipo: string }) => i.tipo)).toEqual([
      "tarefa_concluida",
      "etapa",
      "conversa",
      "nota",
      "tarefa_criada",
      "criado",
    ]);
    const etapa = body.itens.find((i: { tipo: string }) => i.tipo === "etapa");
    expect(etapa).toMatchObject({ de: "Proposta", para: "Negociação", origem: "fluxo" });
    // O evento de nascimento vira o "criado", sem duplicar.
    expect(body.itens.filter((i: { tipo: string }) => i.tipo === "etapa")).toHaveLength(1);
    expect(body.itens.at(-1)).toMatchObject({ tipo: "criado", etapa: "Proposta" });
    expect(body.itens.find((i: { tipo: string }) => i.tipo === "nota")).toMatchObject({ autor: "Ana" });
  });

  it("conversas com prévia e não lida", async () => {
    const body = await (await get()).json();
    expect(body.conversas).toEqual([
      expect.objectContaining({ id: "cv1", canal: "whatsapp_meta", ultimaMensagem: "Oi", naoLida: true, agente: "Eva" }),
    ]);
  });

  it("sem contatos vinculados não consulta conversas", async () => {
    db.deal.findFirst.mockResolvedValue({ id: "d1", createdAt: d("2026-10-01T12:00:00Z"), contacts: [] });
    const body = await (await get()).json();
    expect(db.conversation.findMany).not.toHaveBeenCalled();
    expect(body.conversas).toEqual([]);
  });

  it("segue sem o histórico de etapas se a tabela falhar", async () => {
    db.dealStageEvent.findMany.mockRejectedValue(new Error("relation does not exist"));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itens.some((i: { tipo: string }) => i.tipo === "etapa")).toBe(false);
    expect(body.itens.at(-1)).toMatchObject({ tipo: "criado", etapa: null });
    expect(db.pipelineStage.findMany).not.toHaveBeenCalled();
  });

  it("etapa apagada aparece como 'etapa removida'", async () => {
    db.pipelineStage.findMany.mockResolvedValue([{ id: "s1", name: "Proposta", type: "open" }]);
    const body = await (await get()).json();
    expect(body.itens.find((i: { tipo: string }) => i.tipo === "etapa")).toMatchObject({ para: "etapa removida" });
  });
});
