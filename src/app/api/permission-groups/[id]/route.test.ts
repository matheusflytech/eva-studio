import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  permissionGroup: { findFirst: vi.fn(), update: vi.fn() },
  membership: { findUnique: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/historico-conta", () => ({
  fotoDoGrupo: vi.fn(),
  fotoSegura: vi.fn(async () => null),
  registrarNaConta: vi.fn(),
}));

import { PATCH } from "./route";

const patch = (id: string) =>
  PATCH(new Request("https://eva.test/api", { method: "PATCH", body: JSON.stringify({ permissions: ["membros:gerenciar"] }) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "admin", papelId: "p1" });
  db.permissionGroup.findFirst.mockResolvedValue({ id: "g1" });
  db.permissionGroup.update.mockResolvedValue({ id: "g1" });
  db.membership.findUnique.mockResolvedValue({ groupIds: ["g1"], customRole: { groupIds: ["g2"] } });
});

describe("PATCH /api/permission-groups/[id]", () => {
  it("não muda grupo que a própria pessoa tem, direto ou pelo papel", async () => {
    expect((await patch("g1")).status).toBe(403);
    expect((await patch("g2")).status).toBe(403);
    expect(db.permissionGroup.update).not.toHaveBeenCalled();
  });

  it("muda grupo de outra pessoa; o dono muda qualquer um", async () => {
    expect((await patch("g3")).status).toBe(200);
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
    expect((await patch("g1")).status).toBe(200);
  });
});
