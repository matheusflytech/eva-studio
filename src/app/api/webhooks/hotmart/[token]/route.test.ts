import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  hotmartEvent: { create: vi.fn(async () => ({ id: "e1" })), update: vi.fn(async () => ({})) },
  hotmartConnection: { update: vi.fn(async () => ({})) },
}));
const con = vi.hoisted(() => ({
  connectionByToken: vi.fn(),
  hottokOf: vi.fn(() => "segredo"),
  sameSecret: (a: string, b: string) => !!a && a === b,
}));
const ap = vi.hoisted(() => ({ applyEvent: vi.fn(async () => ({ result: "ok" })) }));
const pending = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/hotmart/connection", () => con);
vi.mock("@/lib/server/hotmart/apply", () => ap);
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { pending.push(fn()); } }));

import { POST } from "./route";

const req = (hottok: string, body: object) =>
  new Request("http://x/api/webhooks/hotmart/tok", { method: "POST", headers: { "x-hotmart-hottok": hottok }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ token: "tok" }) };
const active = { id: "c1", orgId: "o1", status: "active", secrets: "x", products: {} };

beforeEach(() => vi.clearAllMocks());

describe("webhook Hotmart", () => {
  it("token desconhecido: 404", async () => {
    con.connectionByToken.mockResolvedValue(null);
    expect((await POST(req("segredo", {}), params)).status).toBe(404);
  });
  it("hottok errado: 401 e nada gravado", async () => {
    con.connectionByToken.mockResolvedValue(active);
    expect((await POST(req("outro", { id: "ev", event: "PURCHASE_APPROVED" }), params)).status).toBe(401);
    expect(db.hotmartEvent.create).not.toHaveBeenCalled();
  });
  it("conexão pausada: 200 sem gravar", async () => {
    con.connectionByToken.mockResolvedValue({ ...active, status: "paused" });
    expect((await POST(req("segredo", { id: "ev", event: "PURCHASE_APPROVED" }), params)).status).toBe(200);
    expect(db.hotmartEvent.create).not.toHaveBeenCalled();
  });
  it("evento repetido (id já gravado): 200 sem aplicar de novo", async () => {
    con.connectionByToken.mockResolvedValue(active);
    db.hotmartEvent.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    const r = await POST(req("segredo", { id: "ev", event: "PURCHASE_APPROVED" }), params);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ repeated: true });
    expect(ap.applyEvent).not.toHaveBeenCalled();
  });
  it("evento novo: grava e aplica depois da resposta", async () => {
    con.connectionByToken.mockResolvedValue(active);
    const r = await POST(req("segredo", { id: "ev", event: "PURCHASE_APPROVED", data: { product: { id: 1 } } }), params);
    await Promise.all(pending.splice(0));
    expect(r.status).toBe(200);
    expect(ap.applyEvent).toHaveBeenCalled();
    expect(db.hotmartEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "e1" } }));
  });
});
