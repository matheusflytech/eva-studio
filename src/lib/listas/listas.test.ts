import { describe, expect, it } from "vitest";
import { SEM_VALOR } from "@/lib/consulta";
import { sanearFiltroCrm } from "@/lib/filtro-crm";
import { alternarColuna, chaveDasColunas, colunasValidas, moverColuna } from "./colunas";
import {
  condicoesDaBarra,
  estadoParaUrl,
  estadoVazio,
  filtrandoAlgo,
  lerEstadoDaUrl,
  lerPeriodo,
  limparFiltros,
  montarFiltro,
  periodoParaTexto,
  rotuloDoPeriodo,
  type EstadoDaLista,
  type FiltroDaBarra,
} from "./estado-da-lista";

const BARRA: FiltroDaBarra[] = [
  { campo: "responsavel", rotulo: "Proprietário", param: "dono", tipo: "lista" },
  { campo: "empresa", rotulo: "Empresas", param: "empresa", tipo: "lista" },
  { campo: "criadoEm", rotulo: "Criado em", param: "criado", tipo: "data" },
  { campo: "ultimaAtividade", rotulo: "Última atividade", param: "atividade", tipo: "data" },
];
const PADRAO = { visao: "todos", tamanho: 25 };
const HOJE = "2026-10-19";

function estado(p: Partial<EstadoDaLista> = {}): EstadoDaLista {
  return { ...estadoVazio(PADRAO), ...p };
}

describe("períodos da barra", () => {
  it("ida e volta pelo texto da URL", () => {
    for (const t of ["hoje", "7d", "30d", "mes", "2026-10-01~2026-10-31"]) expect(periodoParaTexto(lerPeriodo(t)!)).toBe(t);
  });

  it("intervalo invertido é endireitado; lixo vira null", () => {
    expect(lerPeriodo("2026-10-31~2026-10-01")).toEqual({ tipo: "entre", de: "2026-10-01", ate: "2026-10-31" });
    expect(lerPeriodo("0d")).toBeNull();
    expect(lerPeriodo("2026-02-30~2026-03-01")).toBeNull();
    expect(lerPeriodo("ontem")).toBeNull();
  });

  it("rótulos", () => {
    expect(rotuloDoPeriodo({ tipo: "ultimos", dias: 30 })).toBe("Últimos 30 dias");
    expect(rotuloDoPeriodo({ tipo: "ultimos", dias: 14 })).toBe("Últimos 14 dias");
    expect(rotuloDoPeriodo({ tipo: "esteMes" })).toBe("Este mês");
    expect(rotuloDoPeriodo({ tipo: "entre", de: "2026-10-01", ate: "2026-10-31" })).toBe("01/10/2026 – 31/10/2026");
  });
});

describe("montagem do filtro a partir da barra", () => {
  it("cada filtro preenchido vira uma condição, na ordem da barra", () => {
    const e = estado({
      listas: { empresa: ["e1"], responsavel: ["u1", SEM_VALOR], etiqueta: ["fora-da-barra"] },
      datas: { criadoEm: { tipo: "esteMes" }, ultimaAtividade: { tipo: "hoje" } },
    });
    expect(condicoesDaBarra(e, BARRA, HOJE)).toEqual([
      { campo: "responsavel", op: "qualquer", valores: ["u1", SEM_VALOR] },
      { campo: "empresa", op: "qualquer", valores: ["e1"] },
      { campo: "criadoEm", op: "entre", valor: "2026-10-01", ate: HOJE },
      { campo: "ultimaAtividade", op: "em", valor: HOJE },
    ]);
  });

  it("junta visão + barra em rapidos, mantém avançados e busca", () => {
    const avancado = { logica: "ou" as const, grupos: [{ logica: "e" as const, condicoes: [{ campo: "email", op: "vazio" as const }] }] };
    const f = montarFiltro(estado({ busca: "  ana ", listas: { empresa: ["e1"] }, avancado }), BARRA, {
      hoje: HOJE,
      daVisao: [{ campo: "responsavel", op: "qualquer", valores: ["eu"] }],
    });
    expect(f).toEqual({
      logica: "ou",
      grupos: avancado.grupos,
      busca: "ana",
      rapidos: [
        { campo: "responsavel", op: "qualquer", valores: ["eu"] },
        { campo: "empresa", op: "qualquer", valores: ["e1"] },
      ],
    });
    // O servidor aceita o que a barra monta, sem aviso.
    expect(sanearFiltroCrm(f, "contatos").avisos).toEqual([]);
  });

  it("sem nada: filtro vazio, sem chaves extras", () => {
    expect(montarFiltro(estado(), BARRA, { hoje: HOJE })).toEqual({ logica: "e", grupos: [] });
  });

  it("filtrandoAlgo e limparFiltros", () => {
    expect(filtrandoAlgo(estado({ visao: "meus" }))).toBe(false);
    const e = estado({ visao: "meus", busca: "x", listas: { empresa: ["e1"] }, pagina: 4, tamanho: 50 });
    expect(filtrandoAlgo(e)).toBe(true);
    expect(limparFiltros(e)).toEqual(estado({ visao: "meus", tamanho: 50 }));
  });
});

describe("estado na URL", () => {
  it("ida e volta sem perder nada", () => {
    const e = estado({
      visao: "meus",
      busca: "ana souza",
      listas: { responsavel: ["u1", SEM_VALOR], empresa: ["e1", "e2"] },
      datas: { criadoEm: { tipo: "ultimos", dias: 30 }, ultimaAtividade: { tipo: "entre", de: "2026-10-01", ate: "2026-10-15" } },
      avancado: { logica: "e", grupos: [{ logica: "ou", condicoes: [{ campo: "email", op: "vazio" }, { campo: "telefone", op: "vazio" }] }] },
      ordem: { key: "nome", direction: "asc" },
      pagina: 3,
      tamanho: 50,
    });
    const sp = estadoParaUrl(e, BARRA, PADRAO);
    expect(sp.get("dono")).toBe(`u1,${SEM_VALOR}`);
    expect(sp.get("criado")).toBe("30d");
    expect(sp.get("ordem")).toBe("nome:asc");
    expect(lerEstadoDaUrl(new URLSearchParams(sp.toString()), BARRA, PADRAO)).toEqual(e);
  });

  it("padrão não vai para a URL", () => {
    expect(estadoParaUrl(estado(), BARRA, PADRAO).toString()).toBe("");
  });

  it("parâmetro inválido vira padrão, sem lançar", () => {
    const sp = new URLSearchParams("v=outra&p=-3&pp=33&ordem=nome;drop&av={quebrado&criado=ontem&dono=,,");
    expect(lerEstadoDaUrl(sp, BARRA, PADRAO, ["todos", "meus"])).toEqual(estado());
  });
});

describe("colunas salvas", () => {
  const DISP = ["nome", "email", "dono", "telefone", "cf:plano"];
  const PAD = ["nome", "email", "dono"];

  it("valida o que veio do armazenamento (JSON ou array)", () => {
    expect(colunasValidas(JSON.stringify(["telefone", "nome", "x", "telefone"]), DISP, PAD, ["nome"])).toEqual(["nome", "telefone"]);
    expect(colunasValidas(["cf:plano", "email"], DISP, PAD, ["nome"])).toEqual(["nome", "cf:plano", "email"]);
  });

  it("nada salvo, lixo ou só desconhecidas = padrão", () => {
    expect(colunasValidas(null, DISP, PAD)).toEqual(PAD);
    expect(colunasValidas("{", DISP, PAD)).toEqual(PAD);
    expect(colunasValidas(["sumiu"], DISP, PAD)).toEqual(PAD);
  });

  it("liga no fim, desliga, não tira a fixa", () => {
    expect(alternarColuna(PAD, "telefone", true)).toEqual([...PAD, "telefone"]);
    expect(alternarColuna(PAD, "email", false)).toEqual(["nome", "dono"]);
    expect(alternarColuna(PAD, "nome", false, ["nome"])).toEqual(PAD);
  });

  it("move uma posição sem passar a fixa", () => {
    expect(moverColuna(PAD, "dono", -1)).toEqual(["nome", "dono", "email"]);
    expect(moverColuna(PAD, "email", -1, ["nome"])).toEqual(PAD);
    expect(moverColuna(PAD, "dono", 1)).toEqual(PAD);
  });

  it("chave por lista, contrato e usuário", () => {
    expect(chaveDasColunas("contatos", "123", "u1")).toBe("eva:colunas:contatos:123:u1");
    expect(chaveDasColunas("contatos", null, "")).toBe("eva:colunas:contatos:-:-");
  });
});
