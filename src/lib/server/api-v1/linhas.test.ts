import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { linhasDoCsv } from "./linhas";

describe("CSV da importação", () => {
  it("coluna de id de outro sistema é recusada (não vira campo personalizado em silêncio)", () => {
    for (const coluna of ["external_id", "ID Externo", "contato_id_externo"]) {
      expect(() => linhasDoCsv("contacts", `${coluna};name\n1;Ana`, [])).toThrow(expect.objectContaining({ code: "invalid_csv" }));
    }
  });

  it("colunas normais seguem: em inglês ou apelido em português", () => {
    expect(linhasDoCsv("contacts", "nome;cargo\nAna;Compras", [])).toEqual([{ row: 2, record: { name: "Ana", job_title: "Compras" } }]);
  });
});
