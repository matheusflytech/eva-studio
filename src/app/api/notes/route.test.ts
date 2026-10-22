import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  note: { create: vi.fn() },
  contact: { findFirst: vi.fn() },
  deal: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/notes", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.note.create.mockResolvedValue({ id: "n1", createdAt: new Date("2026-10-20T12:00:00Z") });
  db.contact.findFirst.mockResolvedValue({ id: "c1" });
  db.deal.findFirst.mockResolvedValue({ id: "d1" });
});

describe("POST /api/notes", () => {
  it("JSON inválido → 400", async () => {
    const res = await post("[1,2");
    expect(res.status).toBe(400);
  });

  it("negócio de outra org → 404, sem gravar", async () => {
    db.deal.findFirst.mockResolvedValue(null);
    const res = await post({ text: "Oi", dealId: "d-outra" });
    expect(res.status).toBe(404);
    expect(db.note.create).not.toHaveBeenCalled();
  });

  it("contato de outra org → 404", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await post({ text: "Oi", contactId: "c-outra" });
    expect(res.status).toBe(404);
  });

  it("texto longo é cortado em 5000", async () => {
    const res = await post({ text: "a".repeat(6000), dealId: "d1" });
    expect(res.status).toBe(200);
    expect(db.note.create.mock.calls[0][0].data.text).toHaveLength(5000);
  });
});
