import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn(), findMany: vi.fn() },
  pipelineStage: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { comNumeros, lerNumero, uuidDaEtapa, uuidDoFunil } from "./funis";
import { ErroApi } from "./http";

beforeEach(() => vi.clearAllMocks());

describe("funil e etapa pelo número do contrato", () => {
  it("aceita inteiro ou texto de dígitos; UUID, zero, decimal e texto são 400", () => {
    expect(lerNumero(3, "stage_id")).toBe(3);
    expect(lerNumero(" 12 ", "stage_id")).toBe(12);
    for (const v of ["8d8d3a8c-2ff6-485e-a325-17384e9990cf", 0, -1, 1.5, "1.5", "abc", null, true]) {
      expect(() => lerNumero(v, "stage_id")).toThrow(expect.objectContaining({ status: 400, code: "invalid_parameter" }));
    }
  });

  it("número → UUID dentro do contrato; número que não existe é 404 invalid_reference", async () => {
    db.pipeline.findFirst.mockResolvedValue({ id: "p-uuid" });
    expect(await uuidDoFunil("o1", "2")).toBe("p-uuid");
    expect(db.pipeline.findFirst.mock.calls[0][0].where).toEqual({ orgId: "o1", numero: 2 });

    db.pipelineStage.findFirst.mockResolvedValue(null);
    const erro = await uuidDaEtapa("o1", 99, "trigger_stage_id").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 404, code: "invalid_reference", extra: { param: "trigger_stage_id" } });
  });

  it("comNumeros troca os UUIDs guardados pelo número (apagado vira null) e não mexe no resto", async () => {
    db.pipeline.findMany.mockResolvedValue([{ id: "p1", numero: 1 }]);
    db.pipelineStage.findMany.mockResolvedValue([{ id: "s1", numero: 4 }]);
    expect(await comNumeros({ pipeline_id: "p1", from_stage_id: "s1", to_stage_id: "s-apagada", name: "X" })).toEqual({
      pipeline_id: 1,
      from_stage_id: 4,
      to_stage_id: null,
      name: "X",
    });
    expect(await comNumeros(null)).toBeNull();
  });
});
