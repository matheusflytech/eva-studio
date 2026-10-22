import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  company: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  profile: { findFirst: vi.fn() },
  contact: { updateMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { POST } from "./route";
import { PATCH } from "./[companyId]/route";
import { cnpjValido } from "./cnpj";

function req(body: unknown, method = "POST") {
  return new Request("https://eva.test/api/companies", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.company.findFirst.mockResolvedValue(null);
  db.company.create.mockResolvedValue({ id: "emp1", name: "Acme" });
  db.profile.findFirst.mockResolvedValue({ id: "u1" });
});

describe("cnpjValido", () => {
  it("confere os dígitos verificadores", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

describe("POST /api/companies", () => {
  it("JSON inválido → 400", async () => {
    expect((await POST(req("{"))).status).toBe(400);
  });

  it("CNPJ inválido → 400", async () => {
    const res = await POST(req({ name: "Acme", cnpj: "123" }));
    expect(res.status).toBe(400);
    expect(db.company.create).not.toHaveBeenCalled();
  });

  it('size "abc" → 400 (não NaN no banco)', async () => {
    expect((await POST(req({ name: "Acme", size: "abc" }))).status).toBe(400);
  });

  it("responsável de outra org → 404", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    expect((await POST(req({ name: "Acme", ownerId: "u-outra" }))).status).toBe(404);
    expect(db.company.create).not.toHaveBeenCalled();
  });

  it("CNPJ válido com máscara grava só dígitos", async () => {
    const res = await POST(req({ name: "Acme", cnpj: "11.222.333/0001-81", size: "12" }));
    expect(res.status).toBe(200);
    expect(db.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cnpj: "11222333000181", size: 12, ownerId: "u1" }),
    });
  });
});

describe("PATCH /api/companies/[id]", () => {
  const params = Promise.resolve({ companyId: "emp1" });
  beforeEach(() => db.company.findFirst.mockResolvedValue({ id: "emp1", name: "Acme" }));

  it("JSON inválido → 400", async () => {
    expect((await PATCH(req("[]", "PATCH"), { params })).status).toBe(400);
  });

  it("responsável de outra org → 404", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    expect((await PATCH(req({ ownerId: "u-outra" }, "PATCH"), { params })).status).toBe(404);
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it("CNPJ inválido → 400", async () => {
    expect((await PATCH(req({ cnpj: "11222333000100" }, "PATCH"), { params })).status).toBe(400);
  });
});
