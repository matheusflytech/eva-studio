import { describe, it, expect } from "vitest";
import { CAMPOS_DE_NEGOCIO, lerOrdenacao, lerPagina, lerTamanhoDePagina, sanearFiltroCrm } from "./filtro-crm";
import { CAMPOS_DE_FILTRO } from "./consulta";

describe("sanearFiltroCrm", () => {
  it("aceita objeto ou JSON em texto, com busca", () => {
    const f = { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "ultimaAtividade", op: "ultimos", valor: "30" }] }], busca: "  ana " };
    const esperado = { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "ultimaAtividade", op: "ultimos", valor: "30" }] }], busca: "ana" };
    expect(sanearFiltroCrm(f, "contatos")).toEqual({ filtro: esperado, avisos: [] });
    expect(sanearFiltroCrm(JSON.stringify(f), "contatos").filtro).toEqual(esperado);
  });

  it("o catálogo é o da entidade: campo de negócio em contato cai com aviso", () => {
    const r = sanearFiltroCrm([{ campo: "tarefa", op: "qualquer", valores: ["atrasada"] }], "contatos");
    expect(r.filtro.grupos).toEqual([]);
    expect(r.avisos).toEqual(["Condição “tarefa” ignorada: campo desconhecido."]);
    expect(sanearFiltroCrm([{ campo: "tarefa", op: "qualquer", valores: ["atrasada"] }], "negocios").avisos).toEqual([]);
  });

  it("'é' numa lista vira 'é qualquer de' (mesma normalização do dashboard)", () => {
    expect(sanearFiltroCrm([{ campo: "responsavel", op: "eq", valor: "u1" }], "contatos").filtro.grupos[0].condicoes).toEqual([
      { campo: "responsavel", op: "qualquer", valores: ["u1"] },
    ]);
  });

  it("campo personalizado passa (conferido no servidor)", () => {
    expect(sanearFiltroCrm([{ campo: "cf:plano", op: "qualquer", valores: ["a"] }], "contatos").avisos).toEqual([]);
  });

  it("vazio e lixo não quebram", () => {
    expect(sanearFiltroCrm("", "negocios")).toEqual({ filtro: { logica: "e", grupos: [] }, avisos: [] });
    expect(sanearFiltroCrm(42, "negocios").filtro.grupos).toEqual([]);
    expect(sanearFiltroCrm("[", "negocios").avisos).toEqual(["Filtro ignorado: não é um JSON válido."]);
  });

  it("o catálogo de negócio contém todos os campos do dashboard", () => {
    const ids = CAMPOS_DE_NEGOCIO.map((c) => c.id);
    for (const c of CAMPOS_DE_FILTRO) expect(ids).toContain(c.id);
  });
});

describe("ordenação", () => {
  it.each(["nome", "email", "telefone", "empresa", "responsavel", "criadoEm", "ultimaAtividade"])("contatos: %s permitida", (campo) => {
    expect(lerOrdenacao({ campo, direcao: "asc" }, "contatos")).toEqual({ ordenacao: { campo, direcao: "asc" } });
  });

  it.each(["nome", "valor", "etapa", "responsavel", "criadoEm", "previsao", "fechadoEm", "diasNaEtapa"])("negócios: %s permitida", (campo) => {
    expect(lerOrdenacao(`${campo}:asc`, "negocios")).toEqual({ ordenacao: { campo, direcao: "asc" } });
  });

  it("formatos curtos e direção padrão desc", () => {
    expect(lerOrdenacao("-valor", "negocios").ordenacao).toEqual({ campo: "valor", direcao: "desc" });
    expect(lerOrdenacao("valor", "negocios", "asc").ordenacao).toEqual({ campo: "valor", direcao: "asc" });
    expect(lerOrdenacao("valor", "negocios").ordenacao).toEqual({ campo: "valor", direcao: "desc" });
    expect(lerOrdenacao(undefined, "contatos")).toEqual({ ordenacao: { campo: "ultimaAtividade", direcao: "desc" } });
  });

  it("coluna não permitida volta ao padrão com aviso", () => {
    const r = lerOrdenacao("passwordHash", "contatos");
    expect(r.ordenacao).toEqual({ campo: "ultimaAtividade", direcao: "desc" });
    expect(r.aviso).toContain("não é permitida");
    expect(lerOrdenacao("cf:plano", "negocios").aviso).toContain("campo personalizado");
    expect(lerOrdenacao("ultimaAtividade", "negocios").ordenacao).toEqual({ campo: "criadoEm", direcao: "desc" });
  });
});

describe("paginação", () => {
  it("pageSize 25/50/100; qualquer outro vira 25", () => {
    expect(lerTamanhoDePagina(50)).toBe(50);
    expect(lerTamanhoDePagina("100")).toBe(100);
    for (const x of [undefined, 0, 10, 99, 1000, "abc", -25]) expect(lerTamanhoDePagina(x)).toBe(25);
  });

  it("página ≥ 1 e inteira", () => {
    expect(lerPagina("3")).toBe(3);
    expect(lerPagina(2.7)).toBe(2);
    for (const x of [undefined, 0, -1, "x"]) expect(lerPagina(x)).toBe(1);
  });
});
