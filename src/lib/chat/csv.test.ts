import { describe, expect, it } from "vitest";
import type { ReportResult } from "@/lib/report-query";
import { csvDoResultado } from "./csv";

const r = (rows: ReportResult["rows"]): ReportResult => ({
  columns: [
    { key: "d0", label: "Etapa", type: "text", role: "dimension" },
    { key: "m0", label: "Soma de Valor", type: "money", role: "metric" },
  ],
  rows,
  truncated: false,
});

describe("csvDoResultado", () => {
  it("cabeçalho, vírgula decimal, ponto e vírgula e BOM", () => {
    expect(csvDoResultado(r([["Proposta", 1500.5], ["Ganho", null]]))).toBe("﻿Etapa;Soma de Valor\r\nProposta;1500,5\r\nGanho;\r\n");
  });

  it("escapa aspas, quebra de linha e ponto e vírgula", () => {
    const csv = csvDoResultado(r([['Ana "A"; Silva', 1], ["linha1\nlinha2", 2]]));
    expect(csv).toContain('"Ana ""A""; Silva";1');
    expect(csv).toContain('"linha1\nlinha2";2');
  });

  it("texto que parece fórmula não vira fórmula na planilha", () => {
    const csv = csvDoResultado(r([["=HYPERLINK(\"http://x\")", 1], ["-cmd", 2], ["+1", 3], ["@soma", 4]]));
    const linhas = csv.split("\r\n");
    expect(linhas[1].startsWith("\"'=HYPERLINK")).toBe(true);
    expect(linhas[2]).toBe("'-cmd;2");
    expect(linhas[3]).toBe("'+1;3");
    expect(linhas[4]).toBe("'@soma;4");
  });

  it("booleano vira Sim e Não", () => {
    expect(csvDoResultado({ ...r([[true, 0]]), columns: [{ key: "d0", label: "Ganho", type: "bool", role: "dimension" }, { key: "m0", label: "n", type: "number", role: "metric" }] })).toContain("Sim;0");
  });
});
