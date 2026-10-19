import { describe, it, expect } from "vitest";
import {
  CONSULTA_PADRAO,
  descreverCondicao,
  descreverSelecao,
  filtrosGlobaisParaQuery,
  janelaAnterior,
  janelaDoPainel,
  normalizarCondicao,
  sanearCondicao,
  sanearConsulta,
  sanearFiltros,
  sanearFiltrosGlobais,
  tiposPermitidos,
  type Consulta,
  type RotulosDaConsulta,
} from "./consulta";

describe("sanearConsulta — retrocompatibilidade", () => {
  it("consulta salva no formato antigo vira a nova: funilId → funilIds, filtros em lista → um grupo E", () => {
    const antiga = {
      medida: "soma",
      campo: "valor",
      agrupar: "etapa",
      status: "ganhos",
      funilId: "p1",
      periodo: "painel",
      filtros: [
        { campo: "etapa", op: "eq", valor: "s1" },
        { campo: "responsavel", op: "neq", valor: "u1" },
        { campo: "cf:segmento", op: "eq", valor: "varejo" },
      ],
    };
    expect(sanearConsulta(antiga)).toEqual({
      medida: "soma",
      campo: "valor",
      agrupar: "etapa",
      status: "ganhos",
      funilIds: ["p1"],
      periodo: "painel",
      filtros: {
        logica: "e",
        grupos: [
          {
            logica: "e",
            condicoes: [
              // Campo base: o operador antigo já sai no vocabulário novo.
              { campo: "etapa", op: "qualquer", valores: ["s1"] },
              { campo: "responsavel", op: "nenhum", valores: ["u1"] },
              // Campo personalizado: o tipo depende da definição, normaliza onde ela existe.
              { campo: "cf:segmento", op: "eq", valor: "varejo" },
            ],
          },
        ],
      },
    });
  });

  it("filtro antigo sem valor (rascunho) é descartado, como antes", () => {
    const c = sanearConsulta({ medida: "contagem", agrupar: "", status: "todos", filtros: [{ campo: "etapa", op: "eq", valor: "" }] });
    expect(c?.filtros.grupos).toEqual([]);
  });

  it("CONSULTA_PADRAO passa intacta", () => {
    expect(sanearConsulta(CONSULTA_PADRAO)).toEqual(CONSULTA_PADRAO);
  });

  it("recusa medida, agrupamento e campo inválidos", () => {
    expect(sanearConsulta({ medida: "DROP", agrupar: "" })).toBeNull();
    expect(sanearConsulta({ medida: "contagem", agrupar: "1; drop" })).toBeNull();
    expect(sanearConsulta({ medida: "mediana", agrupar: "", campo: "senha" })).toBeNull();
    expect(sanearConsulta(null)).toBeNull();
  });

  it("aceita medidas, agrupamentos, período fixo, data base e comparação novos", () => {
    const c = sanearConsulta({
      medida: "taxaGanho",
      agrupar: "trimestre",
      status: "todos",
      funilIds: ["p1", "p2", "p1", "x y"],
      periodo: { de: "2026-09-30", ate: "2026-07-01" },
      dataBase: "previsao",
      comparar: true,
    });
    expect(c).toMatchObject({
      medida: "taxaGanho",
      agrupar: "trimestre",
      funilIds: ["p1", "p2"],
      // Invertido: o servidor arruma em vez de devolver vazio.
      periodo: { de: "2026-07-01", ate: "2026-09-30" },
      dataBase: "previsao",
      comparar: true,
    });
    expect(c?.campo).toBeUndefined();
    for (const g of ["semana", "funil", "tipoEtapa", "motivoPerda", "empresa", "canal", "faixaValor"]) {
      expect(sanearConsulta({ medida: "contagem", agrupar: g })?.agrupar).toBe(g);
    }
  });

  it("período desconhecido vira todo o histórico; data inválida também", () => {
    expect(sanearConsulta({ medida: "contagem", agrupar: "", periodo: "ontem" })?.periodo).toBe("tudo");
    expect(sanearConsulta({ medida: "contagem", agrupar: "", periodo: { de: "2026-02-31", ate: "2026-03-01" } })?.periodo).toBe("tudo");
  });
});

describe("sanearFiltros / sanearCondicao", () => {
  it("grupos com lógica, limitados a 5 grupos × 8 condições", () => {
    const cond = { campo: "valor", op: "gte", valor: "10" };
    const f = sanearFiltros({
      logica: "ou",
      grupos: Array.from({ length: 9 }, () => ({ logica: "ou", condicoes: Array.from({ length: 12 }, () => cond) })),
    });
    expect(f.logica).toBe("ou");
    expect(f.grupos).toHaveLength(5);
    expect(f.grupos[0]).toMatchObject({ logica: "ou" });
    expect(f.grupos[0].condicoes).toHaveLength(8);
  });

  it("grupo sem nenhuma condição válida some", () => {
    expect(sanearFiltros({ logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "etapa", op: "qualquer", valores: [] }] }] }).grupos).toEqual([]);
  });

  it("recusa campo e operador desconhecidos, e operador que não cabe no tipo", () => {
    expect(sanearCondicao({ campo: "senha", op: "eq", valor: "x" })).toBeNull();
    expect(sanearCondicao({ campo: "valor", op: "sql", valor: "1" })).toBeNull();
    expect(sanearCondicao({ campo: "valor", op: "contem", valor: "1" })).toBeNull();
    // Valor nunca fica vazio: "está vazio" não é oferecido.
    expect(sanearCondicao({ campo: "valor", op: "vazio" })).toBeNull();
  });

  it("valida o valor conforme o tipo e o operador", () => {
    expect(sanearCondicao({ campo: "criadoEm", op: "em", valor: "2026-13-01" })).toBeNull();
    expect(sanearCondicao({ campo: "criadoEm", op: "entre", valor: "2026-10-01" })).toBeNull();
    expect(sanearCondicao({ campo: "valor", op: "gt", valor: "abc" })).toBeNull();
    expect(sanearCondicao({ campo: "fechadoEm", op: "ultimos", valor: "0" })).toBeNull();
    expect(sanearCondicao({ campo: "fechadoEm", op: "ultimos", valor: "30" })).toEqual({ campo: "fechadoEm", op: "ultimos", valor: "30" });
    expect(sanearCondicao({ campo: "valor", op: "entre", valor: "1.000", ate: "5.000,50" })).toEqual({ campo: "valor", op: "entre", valor: "1.000", ate: "5.000,50" });
    expect(sanearCondicao({ campo: "empresa", op: "vazio", valor: "lixo" })).toEqual({ campo: "empresa", op: "vazio" });
    expect(sanearCondicao({ campo: "etiqueta", op: "qualquer", valores: ["t1", "t1", "", "t2"] })).toEqual({ campo: "etiqueta", op: "qualquer", valores: ["t1", "t2"] });
  });
});

describe("normalizarCondicao", () => {
  it("leva operadores antigos pro vocabulário do tipo", () => {
    expect(normalizarCondicao({ campo: "cf:x", op: "eq", valor: "a" }, "lista")).toEqual({ campo: "cf:x", op: "qualquer", valores: ["a"] });
    expect(normalizarCondicao({ campo: "cf:x", op: "neq", valor: "a" }, "multi")).toEqual({ campo: "cf:x", op: "nenhum", valores: ["a"] });
    expect(normalizarCondicao({ campo: "cf:d", op: "gt", valor: "2026-01-01" }, "data").op).toBe("depois");
    expect(normalizarCondicao({ campo: "cf:d", op: "lt", valor: "2026-01-01" }, "data").op).toBe("antes");
    expect(normalizarCondicao({ campo: "cf:b", op: "neq", valor: "true" }, "sim_nao")).toMatchObject({ op: "eq", valor: "false" });
    expect(normalizarCondicao({ campo: "cf:n", op: "gt", valor: "3" }, "numero").op).toBe("gt");
  });
});

describe("filtros globais e janelas", () => {
  it("lê da URL, descarta lixo e devolve a query sem os padrões", () => {
    const g = sanearFiltrosGlobais(new URLSearchParams("de=2026-10-31&ate=2026-10-01&funis=p1,p2,%27;drop&donos=__nenhum,u1&dias=9999"));
    expect(g).toEqual({ dias: 365, de: "2026-10-01", ate: "2026-10-31", funis: ["p1", "p2"], donos: ["__nenhum", "u1"] });
    expect(filtrosGlobaisParaQuery(g)).toBe("de=2026-10-01&ate=2026-10-31&funis=p1%2Cp2&donos=__nenhum%2Cu1");
    expect(filtrosGlobaisParaQuery(sanearFiltrosGlobais({}))).toBe("");
    expect(filtrosGlobaisParaQuery(sanearFiltrosGlobais({ dias: 7 }))).toBe("dias=7");
  });

  it("últimos N dias contam hoje, no fuso de São Paulo", () => {
    // 02h UTC do dia 20 ainda é dia 19 em São Paulo.
    const agora = new Date("2026-10-20T02:00:00Z");
    expect(janelaDoPainel(7, undefined, undefined, agora)).toEqual({ de: "2026-10-13", ate: "2026-10-19" });
    expect(janelaDoPainel(7, "2026-01-01", "2026-01-31", agora)).toEqual({ de: "2026-01-01", ate: "2026-01-31" });
  });

  it("período anterior tem o mesmo tamanho e termina na véspera", () => {
    expect(janelaAnterior({ de: "2026-10-01", ate: "2026-10-31" })).toEqual({ de: "2026-08-31", ate: "2026-09-30" });
    expect(janelaAnterior({ de: "2026-03-01", ate: "2026-03-01" })).toEqual({ de: "2026-02-28", ate: "2026-02-28" });
  });
});

describe("tiposPermitidos", () => {
  it("semana e trimestre são série no tempo; faixa é quebra", () => {
    const c = (agrupar: string) => ({ ...CONSULTA_PADRAO, agrupar });
    expect(tiposPermitidos(c("semana"))).toEqual(["linha", "barras"]);
    expect(tiposPermitidos(c("trimestre"))).toEqual(["linha", "barras"]);
    expect(tiposPermitidos(c("faixaValor"))).toEqual(["pizza", "barras"]);
    expect(tiposPermitidos(c(""))).toEqual(["numero", "tabela"]);
  });
});

describe("descrição em português", () => {
  const r: RotulosDaConsulta = {
    campos: [{ key: "segmento", label: "Segmento", type: "select", options: [{ value: "varejo", label: "Varejo" }, { value: "saude", label: "Saúde" }] }],
    funis: [{ id: "p1", name: "Vendas B2B", stages: [{ id: "s1", name: "Proposta" }] }],
    membros: [{ id: "u1", name: "Ana" }],
  };

  it("monta a frase do exemplo do dono", () => {
    const c: Consulta = {
      ...CONSULTA_PADRAO,
      status: "todos",
      funilIds: ["p1"],
      filtros: {
        logica: "e",
        grupos: [
          {
            logica: "e",
            condicoes: [
              { campo: "cf:segmento", op: "qualquer", valores: ["varejo", "saude"] },
              { campo: "valor", op: "gte", valor: "5000" },
            ],
          },
        ],
      },
    };
    // toLocaleString põe espaço não separável depois do R$.
    expect(descreverSelecao(c, r).replace(/ /g, " ")).toBe("Negócios do funil Vendas B2B, em que Segmento é Varejo ou Saúde e Valor ≥ R$ 5.000");
  });

  it("grupos com OU ganham parênteses; listas negadas usam 'nem'", () => {
    const c: Consulta = {
      ...CONSULTA_PADRAO,
      status: "abertos",
      filtros: {
        logica: "ou",
        grupos: [
          { logica: "e", condicoes: [{ campo: "etapa", op: "qualquer", valores: ["s1"] }, { campo: "responsavel", op: "nenhum", valores: ["u1", "__nenhum"] }] },
          { logica: "e", condicoes: [{ campo: "previsao", op: "proximos", valor: "7" }] },
        ],
      },
    };
    expect(descreverSelecao(c, r)).toBe(
      "Negócios em andamento, em que (Etapa é Proposta e Responsável não é Ana nem sem responsável) ou Previsão de fechamento nos próximos 7 dias"
    );
  });

  it("condição de campo apagado não quebra a frase", () => {
    expect(descreverCondicao({ campo: "cf:sumiu", op: "eq", valor: "x" }, r)).toBe("campo removido");
  });
});
