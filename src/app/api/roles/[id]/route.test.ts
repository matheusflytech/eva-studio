import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ customRole: { findFirst: vi.fn(), update: vi.fn() } }));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/papeis", () => ({ dadosDoPapel: vi.fn(async () => ({ dados: {} })) }));
vi.mock("@/lib/server/historico-conta", () => ({
  fotoDoPapel: vi.fn(),
  fotoSegura: vi.fn(async () => null),
  registrarNaConta: vi.fn(),
}));

import { PATCH } from "./route";

const patch = (id: string) =>
  PATCH(new Request("https://eva.test/api", { method: "PATCH", body: JSON.stringify({ permissions: [] }) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "admin", papelId: "p1" });
  db.customRole.findFirst.mockResolvedValue({ id: "p1" });
  db.customRole.update.mockResolvedValue({ id: "p1" });
});

describe("PATCH /api/roles/[id]", () => {
  it("não muda o próprio papel; muda o dos outros", async () => {
    expect((await patch("p1")).status).toBe(403);
    expect(db.customRole.update).not.toHaveBeenCalled();
    expect((await patch("p2")).status).toBe(200);
  });
});
