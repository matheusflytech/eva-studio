import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  trackedLink: { findUnique: vi.fn(), update: vi.fn() },
  linkClick: { create: vi.fn() },
  $transaction: vi.fn(async () => []),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })), getClientIp: () => "1.2.3.4" }));

import { GET } from "./route";

const call = (code: string, qs = "") => GET(new Request(`http://localhost/w/${code}${qs}`), { params: Promise.resolve({ code }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /w/[code]", () => {
  it("código desconhecido ou arquivado: 404", async () => {
    db.trackedLink.findUnique.mockResolvedValue(null);
    expect((await call("ABC234")).status).toBe(404);
    db.trackedLink.findUnique.mockResolvedValue({ id: "l1", archivedAt: new Date() });
    expect((await call("ABC234")).status).toBe(404);
    expect((await call("../x")).status).toBe(404);
  });

  it("grava o clique sem IP puro e redireciona para o WhatsApp com o código", async () => {
    db.trackedLink.findUnique.mockResolvedValue({ id: "l1", orgId: "o1", phone: "+55 11 99999-0000", message: "Quero saber mais", archivedAt: null });
    const r = await call("abc234", "?fbclid=FB");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://wa.me/5511999990000?text=Quero%20saber%20mais%20(ref%3A%20ABC234)");
    const data = db.linkClick.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: "o1", linkId: "l1", fbclid: "FB" });
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain("1.2.3.4");
    expect(db.trackedLink.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { clicks: { increment: 1 } } });
  });
});
