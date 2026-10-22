import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  segment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  contact: { count: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { GET, POST } from "./route";
import { PATCH } from "./[segmentId]/route";

function req(body: unknown, method = "POST") {
  return new Request("https://eva.test/api/segments", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.contact.count.mockResolvedValue(3);
  db.segment.create.mockResolvedValue({ id: "s1", createdAt: new Date() });
  db.segment.findFirst.mockResolvedValue({ id: "s1", name: "Seg", match: "all", rules: [] });
  db.segment.update.mockResolvedValue({ id: "s1", name: "Seg", match: "all" });
});

describe("segmentos", () => {
  it("JSON inválido → 400 (POST e PATCH)", async () => {
    expect((await POST(req("{"))).status).toBe(400);
    expect((await PATCH(req("{", "PATCH"), { params: Promise.resolve({ segmentId: "s1" }) })).status).toBe(400);
  });

  it("regra com etiqueta vazia → 400, nada salvo", async () => {
    const res = await POST(req({ name: "Seg", rules: [{ field: "tag", op: "has", value: "" }] }));
    expect(res.status).toBe(400);
    expect(db.segment.create).not.toHaveBeenCalled();
    const patch = await PATCH(req({ rules: [{ field: "tag", op: "has", value: "" }] }, "PATCH"), {
      params: Promise.resolve({ segmentId: "s1" }),
    });
    expect(patch.status).toBe(400);
    expect(db.segment.update).not.toHaveBeenCalled();
  });

  it("regra de canal salva e conta por ContactChannel", async () => {
    const res = await POST(req({ name: "Zap", rules: [{ field: "channel", op: "equals", value: "whatsapp_meta" }] }));
    expect(res.status).toBe(200);
    expect(db.contact.count).toHaveBeenCalledWith({
      where: { orgId: "o1", AND: [{ channels: { some: { channel: "whatsapp_meta" } } }] },
    });
  });

  it("GET com segmento de canal salvo não lança", async () => {
    db.segment.findMany.mockResolvedValue([
      { id: "s1", name: "Zap", match: "all", rules: [{ field: "channel", op: "equals", value: "whatsapp_qr" }], createdAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).segments[0].contactCount).toBe(3);
  });
});
