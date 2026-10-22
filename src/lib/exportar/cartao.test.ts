import { describe, it, expect } from "vitest";
import { csvDeTodosOsCartoes, csvDoCartao, tabelaDaFonte, tabelaDoResultado, type DadosDasFontes } from "./cartao";

const dados: DadosDasFontes = {
  numeros: { receita: 1234500, taxa: 0.256 },
  series: { leads: [{ label: "01/10", value: 3 }, { label: "02/10", value: 5 }] },
  quebras: { canais: [{ label: "whatsapp_meta", value: 7 }] },
  tabelas: {
    parados: [{ quando: "2026-10-02T01:00:00Z", titulo: "Solar", contato: "", responsavel: "Ana", valorCents: 50000, etapa: "Proposta" }],
  },
  funis: {
    conv: [
      { nome: "Novo", quantidade: 10, taxaDaAnterior: 1, taxaDoInicio: 1 },
      { nome: "Ganho", quantidade: 4, taxaDaAnterior: 0.4, taxaDoInicio: 0.4 },
    ],
  },
};

describe("CSV do cartão do dashboard", () => {
  it("número de dinheiro: formatado e em reais", () => {
    const t = tabelaDaFonte({ chave: "receita", tipo: "numero", formato: "dinheiro" }, dados);
    expect(t.linhas).toEqual([["R$ 12.345,00", "12345,00"]]);
  });

  it("porcentagem sai em %", () => {
    const t = tabelaDaFonte({ chave: "taxa", tipo: "numero", formato: "porcento" }, dados);
    expect(t.cabecalho[1]).toBe("Valor (%)");
    expect(t.linhas[0]).toEqual(["25,6%", "25,6"]);
  });

  it("série e quebra com rótulo traduzido", () => {
    expect(tabelaDaFonte({ chave: "leads", tipo: "serie" }, dados).linhas).toEqual([["01/10", 3], ["02/10", 5]]);
    const q = tabelaDaFonte({ chave: "canais", tipo: "quebra" }, dados, (l) => (l === "whatsapp_meta" ? "WhatsApp" : l));
    expect(q.linhas).toEqual([["WhatsApp", 7]]);
  });

  it("funil e tabela de parados", () => {
    expect(tabelaDaFonte({ chave: "conv", tipo: "funil" }, dados).linhas).toEqual([
      ["Novo", 10, "", "100"],
      ["Ganho", 4, "40", "40"],
    ]);
    const t = tabelaDaFonte({ chave: "parados", tipo: "tabela" }, dados);
    expect(t.cabecalho[0]).toBe("Parado desde");
    expect(t.linhas[0]).toEqual(["01/10/2026", "Solar", "Proposta", "Ana", "R$ 500,00", "500,00"]);
  });

  it("cartão montado: pontos, número com comparação e lista", () => {
    const p = tabelaDoResultado({ tipo: "pontos", pontos: [{ label: "Ana", value: 1500.5 }], formato: "dinheiro", negocios: 3 });
    expect(p.linhas).toEqual([["Ana", "R$ 1.501", "1500,5"]]);
    const n = tabelaDoResultado({ tipo: "numero", valor: 10, formato: "inteiro", negocios: 10, anterior: 8, variacao: 0.25 });
    expect(n.cabecalho).toContain("Variação %");
    expect(n.linhas[0]).toEqual(["10", "10", 10, "8", "25"]);
    const l = tabelaDoResultado({
      tipo: "tabela",
      negocios: 1,
      linhas: [{ id: "d", titulo: "X", etapa: "Novo", responsavel: "", valorCents: 100, quando: null }],
    });
    expect(l.linhas[0]).toEqual(["X", "Novo", "", "", "R$ 1,00", "1,00"]);
  });

  it("um cartão e todos num arquivo com seções", () => {
    const t = tabelaDaFonte({ chave: "leads", tipo: "serie" }, dados);
    expect(csvDoCartao(t)).toBe("﻿Período;Valor\r\n01/10;3\r\n02/10;5\r\n");
    const todos = csvDeTodosOsCartoes(
      [["Período", "01/10/2026 a 30/10/2026"]],
      [
        { titulo: "Leads", tabela: t },
        { titulo: "Quebrado", tabela: null, erro: "Fonte não encontrada." },
      ]
    );
    expect(todos).toContain("Período;01/10/2026 a 30/10/2026\r\n\r\nCartão: Leads\r\nPeríodo;Valor\r\n01/10;3");
    expect(todos).toContain("Cartão: Quebrado\r\nFonte não encontrada.\r\n");
  });
});
