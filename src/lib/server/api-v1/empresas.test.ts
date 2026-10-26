import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  externalRef: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  company: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { upsertEmpresa } from "./empresas";

beforeEach(() => {
  vi.clearAllMocks();
  db.externalRef.findUnique.mockResolvedValue(null);
  db.company.findFirst.mockResolvedValue({ id: "e1" });
});

describe("upsertEmpresa pelo CNPJ", () => {
  it("empresa do CNPJ já ligada a OUTRO external_id: 409 external_id_mismatch, sem trocar o vínculo", async () => {
    db.externalRef.findMany.mockResolvedValue([{ entityId: "e1", externalId: "erp-antigo" }]);
    await expect(upsertEmpresa("o1", { source: "api", externalId: "erp-novo", cnpj: "11222333000181" })).rejects.toMatchObject({
      status: 409,
      code: "external_id_mismatch",
      extra: { details: { existing_id: "e1", existing_external_id: "erp-antigo", matched_by: "cnpj" } },
    });
    expect(db.externalRef.upsert).not.toHaveBeenCalled();
    expect(db.company.update).not.toHaveBeenCalled();
  });
});
