import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => ({
  tag: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { POST } from "./route";
import { PATCH } from "./[tagId]/route";

function req(body: unknown, method = "POST") {
  return new Request("https://eva.test/api/tags", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const p2002 = () => new Prisma.PrismaClientKnownRequestError("único", { code: "P2002", clientVersion: "7" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.tag.findUnique.mockResolvedValue(null);
  db.tag.findFirst.mockResolvedValue({ id: "t1", name: "quente", color: "slate" });
});

describe("POST /api/tags", () => {
  it("JSON inválido → 400", async () => {
    expect((await POST(req("{"))).status).toBe(400);
  });

  it("corrida no índice único vira 409, não 500", async () => {
    db.tag.create.mockRejectedValue(p2002());
    expect((await POST(req({ name: "quente" }))).status).toBe(409);
  });
});

describe("PATCH /api/tags/[id]", () => {
  const params = Promise.resolve({ tagId: "t1" });

  it("JSON inválido → 400", async () => {
    expect((await PATCH(req("x", "PATCH"), { params })).status).toBe(400);
  });

  it("renomear para nome de outra etiqueta → 409", async () => {
    db.tag.findUnique.mockResolvedValue({ id: "t2", name: "frio" });
    const res = await PATCH(req({ name: "frio" }, "PATCH"), { params });
    expect(res.status).toBe(409);
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("P2002 no update (corrida) → 409", async () => {
    db.tag.update.mockRejectedValue(p2002());
    expect((await PATCH(req({ name: "frio" }, "PATCH"), { params })).status).toBe(409);
  });
});
