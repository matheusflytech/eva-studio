import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  task: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  contact: { findFirst: vi.fn() },
  deal: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { GET, POST } from "./route";
import { PATCH } from "./[taskId]/route";

const req = (body: unknown, method = "POST") =>
  new Request("http://x/api/tasks", { method, body: typeof body === "string" ? body : JSON.stringify(body) });
const params = { params: Promise.resolve({ taskId: "t1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  db.task.create.mockResolvedValue({ id: "t1" });
  db.task.findFirst.mockResolvedValue({ id: "t1", orgId: "org" });
  db.task.update.mockResolvedValue({ id: "t1", doneAt: null });
  db.contact.findFirst.mockResolvedValue({ id: "c1" });
  db.deal.findFirst.mockResolvedValue({ id: "d1" });
  db.profile.findFirst.mockResolvedValue({ id: "u" });
});

describe("POST /api/tasks", () => {
  it("JSON inválido → 400", async () => {
    const res = await POST(req("{"));
    expect(res.status).toBe(400);
  });

  it("dealId de outra org → 404, sem criar", async () => {
    db.deal.findFirst.mockResolvedValue(null);
    const res = await POST(req({ text: "Ligar", dealId: "d-outra" }));
    expect(res.status).toBe(404);
    expect(db.deal.findFirst).toHaveBeenCalledWith({ where: { id: "d-outra", orgId: "org" }, select: { id: true } });
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("responsável de outra org → 404", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    const res = await POST(req({ text: "Ligar", assignedToId: "p-outra" }));
    expect(res.status).toBe(404);
  });

  it("tipo fora da lista → 400", async () => {
    const res = await POST(req({ text: "Ligar", type: "<script>" }));
    expect(res.status).toBe(400);
  });

  it("prazo inválido → 400", async () => {
    const res = await POST(req({ text: "Ligar", dueAt: "ontem" }));
    expect(res.status).toBe(400);
  });

  it("prazo ISO é gravado como veio", async () => {
    const res = await POST(req({ text: "Ligar", dueAt: "2026-10-20T17:00:00.000Z" }));
    expect(res.status).toBe(200);
    expect(db.task.create.mock.calls[0][0].data.dueAt.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
});

describe("PATCH /api/tasks/[taskId]", () => {
  it("JSON inválido → 400", async () => {
    const res = await PATCH(req("x", "PATCH"), params);
    expect(res.status).toBe(400);
  });

  it("prazo inválido → 400, sem gravar", async () => {
    const res = await PATCH(req({ dueAt: "2026-13-01" }, "PATCH"), params);
    expect(res.status).toBe(400);
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("responsável de outra org → 404", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    const res = await PATCH(req({ assignedToId: "p-outra" }, "PATCH"), params);
    expect(res.status).toBe(404);
    expect(db.task.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/tasks com intervalo", () => {
  it("intervalo inválido → 400, sem buscar", async () => {
    const res = await GET(new Request("http://x/api/tasks?de=2026-10-31&ate=2026-10-01"));
    expect(res.status).toBe(400);
    expect(db.task.findMany).not.toHaveBeenCalled();
  });
});
