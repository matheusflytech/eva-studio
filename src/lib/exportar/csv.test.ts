import { describe, it, expect } from "vitest";
import {
  BOM,
  celula,
  dataBR,
  dataHoraBR,
  diaSemFusoBR,
  disposicaoDeAnexo,
  hojeSP,
  montarCsv,
  reais,
  reaisCsv,
  slugDoArquivo,
} from "./csv";

describe("csv", () => {
  it("começa com BOM, separa com ; e termina linhas com CRLF", () => {
    const csv = montarCsv([["a", "b"], ["1", 2]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe("a;b\r\n1;2\r\n");
  });

  it("escapa aspas, ponto e vírgula e quebra de linha", () => {
    expect(celula('Diz "oi"')).toBe('"Diz ""oi"""');
    expect(celula("a;b")).toBe('"a;b"');
    expect(celula("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(celula(" espaço ")).toBe('" espaço "');
    expect(celula(null)).toBe("");
    expect(celula(12.5)).toBe("12,5");
  });

  it("neutraliza texto que o Excel executaria como fórmula, mas não telefone", () => {
    expect(celula("=1+1")).toBe("'=1+1");
    expect(celula('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(celula("@SOMA(A1)")).toBe("'@SOMA(A1)");
    expect(celula("+cmd|calc")).toBe("'+cmd|calc");
    expect(celula("+55 11 99999-0000")).toBe("+55 11 99999-0000");
    expect(celula("-12")).toBe("-12");
  });

  it("dinheiro formatado e numérico", () => {
    expect(reais(123456)).toBe("R$ 1.234,56");
    expect(reaisCsv(123456)).toBe("1234,56");
    expect(reaisCsv(5)).toBe("0,05");
  });

  it("datas no fuso de São Paulo", () => {
    // 01:30 UTC do dia 2 = 22:30 do dia 1 em SP.
    expect(dataBR("2026-10-02T01:30:00Z")).toBe("01/10/2026");
    expect(dataHoraBR("2026-10-02T01:30:00Z")).toBe("01/10/2026 22:30");
    expect(dataBR(null)).toBe("");
    // Previsão (dia sem hora): a parte UTC, sem passar pelo fuso.
    expect(diaSemFusoBR("2026-12-15T00:00:00Z")).toBe("15/12/2026");
    expect(hojeSP(new Date("2026-10-20T02:00:00Z"))).toBe("2026-10-19");
  });

  it("nome de arquivo e Content-Disposition", () => {
    expect(slugDoArquivo("Pós-venda / Sul")).toBe("pos-venda-sul");
    expect(slugDoArquivo("***")).toBe("funil");
    const d = disposicaoDeAnexo("negocios-vendas-2026-10-19.csv");
    expect(d).toContain('attachment; filename="negocios-vendas-2026-10-19.csv"');
  });
});
