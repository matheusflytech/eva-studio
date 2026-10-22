import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  dealContact: { findMany: vi.fn() },
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
vi.mock("@/lib/server/escopo-dados", () => ({ filtroDeEscopo: vi.fn(async () => ({})) }));

import { GET } from "./route";

const get = () => GET(new Request("http://x/api/contacts/c1/linha-do-tempo"), { params: Promise.resolve({ contactId: "c1" }) });
const d = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.contact.findFirst.mockResolvedValue({ id: "c1", createdAt: d("2026-10-01T10:00:00Z"), source: "whatsapp" });
  db.dealContact.findMany.mockResolvedValue([{ deal: { id: "d1", name: "Sofá 3 lugares", createdAt: d("2026-10-02T10:00:00Z") } }]);
  db.dealStageEvent.findMany.mockResolvedValue([
    { id: "e2", dealId: "d1", fromStageId: "s1", toStageId: "s2", origem: "usuario", at: d("2026-10-05T10:00:00Z") },
    { id: "e1", dealId: "d1", fromStageId: null, toStageId: "s1", origem: "usuario", at: d("2026-10-02T10:00:00Z") },
  ]);
  db.pipelineStage.findMany.mockResolvedValue([
    { id: "s1", name: "Proposta", type: "open" },
    { id: "s2", name: "Ganho", type: "won" },
  ]);
  db.note.findMany.mockResolvedValue([{ id: "n1", text: "Quer entrega rápida", createdAt: d("2026-10-03T10:00:00Z"), author: { name: "Ana" } }]);
  db.task.findMany.mockResolvedValue([]);
  db.conversation.findMany.mockResolvedValue([
    { id: "cv1", channel: "whatsapp_meta", createdAt: d("2026-10-01T10:05:00Z"), lastMessageText: "Obrigado!" },
  ]);
});

describe("GET /api/contacts/[contactId]/linha-do-tempo", () => {
  it("junta contato, negócios (com o nome), notas e conversas, do mais novo ao mais antigo", async () => {
    const r = await (await get()).json();
    expect(r.itens.map((i: { tipo: string }) => i.tipo)).toEqual(["etapa", "nota", "criado", "conversa", "contato_criado"]);
    const etapa = r.itens[0];
    expect(etapa).toMatchObject({ para: "Ganho", paraTipo: "won", negocio: { id: "d1", nome: "Sofá 3 lugares" } });
    expect(r.itens[2]).toMatchObject({ tipo: "criado", etapa: "Proposta", negocio: { id: "d1" } });
    expect(r.itens[3]).toMatchObject({ ultimaMensagem: "Obrigado!" });
    expect(r.itens[4]).toMatchObject({ origem: "whatsapp" });
  });

  it("tudo preso à org", async () => {
    await get();
    expect(db.contact.findFirst.mock.calls[0][0].where).toMatchObject({ id: "c1", orgId: "org" });
    expect(db.note.findMany.mock.calls[0][0].where).toEqual({ contactId: "c1", orgId: "org" });
    expect(db.conversation.findMany.mock.calls[0][0].where.agent).toEqual({ orgId: "org" });
    expect(db.dealContact.findMany.mock.calls[0][0].where.deal).toEqual({ orgId: "org" });
  });

  it("contato de outra org ou fora do escopo: 404", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("histórico de etapas indisponível: abre com o resto", async () => {
    db.dealStageEvent.findMany.mockRejectedValue(new Error("tabela"));
    const r = await (await get()).json();
    expect(r.itens.some((i: { tipo: string }) => i.tipo === "nota")).toBe(true);
  });
});
