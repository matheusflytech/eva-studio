import { describe, expect, it } from "vitest";
import { SEM_VALOR, type FiltrosDeConsulta } from "@/lib/consulta";
import { diferencasDaBase, estadoParaUrl, estadoVazio, lerEstadoDaUrl, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";
import {
  VISOES_DE_SISTEMA,
  camposRemovidos,
  configDoEstado,
  conferirVisibilidade,
  estadoDaConfig,
  podeMexer,
  podeVer,
  sanearConfig,
  semCamposRemovidos,
} from "./visoes";

const BARRA: FiltroDaBarra[] = [
  { campo: "responsavel", rotulo: "Proprietário", param: "owner", tipo: "lista" },
  { campo: "criadoEm", rotulo: "Criado em", param: "created", tipo: "data" },
];
const PADRAO = { visao: "todos", tamanho: 25 };
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const config = sanearConfig(
  {
    visaoBase: "meus",
    estado: {
      busca: "ana",
      listas: { responsavel: ["u1", SEM_VALOR] },
      datas: { criadoEm: "30d" },
      avancado: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "email", op: "vazio" }] }] },
      ordem: "nome:asc",
      tamanho: 50,
    },
    colunas: ["nome", "email"],
    recolhidas: ["s1"],
    modo: "lista",
  },
  VISOES_DE_SISTEMA.contatos
);

describe("config da visão", () => {
  it("saneia lixo sem lançar", () => {
    const c = sanearConfig({ visaoBase: "hackeada", estado: { listas: { "a b": ["x"], ok: [1, "y"] }, datas: { criadoEm: "ontem" }, ordem: "x;drop", tamanho: 33 }, modo: "tela" }, VISOES_DE_SISTEMA.contatos);
    expect(c).toEqual({
      visaoBase: "todos",
      estado: { busca: "", listas: { ok: ["y"] }, datas: {}, avancado: { logica: "e", grupos: [] }, ordem: null, tamanho: 25 },
    });
    expect(sanearConfig(null, ["todos"]).estado.tamanho).toBe(25);
  });

  it("estado → config → estado sem perder nada", () => {
    const e = estadoDaConfig(config, PADRAO, ID);
    expect(e.visao).toBe(ID);
    expect(e.datas.criadoEm).toEqual({ tipo: "ultimos", dias: 30 });
    expect(e.ordem).toEqual({ key: "nome", direction: "asc" });
    expect(configDoEstado(e, { visaoBase: "meus", modo: "lista" })).toEqual(config);
  });
});

describe("URL: id da visão + só as alterações não salvas", () => {
  const base = estadoDaConfig(config, PADRAO, ID);

  it("visão aberta sem mexer = só ?v=", () => {
    expect(estadoParaUrl(base, BARRA, PADRAO, base).toString()).toBe(`v=${ID}`);
    expect(lerEstadoDaUrl(new URLSearchParams(`v=${ID}`), BARRA, PADRAO, ["todos"], base)).toEqual(base);
  });

  it("filtro tirado vira parâmetro vazio e volta igual", () => {
    const mexido = { ...base, listas: {}, busca: "bia", ordem: null };
    const sp = estadoParaUrl(mexido, BARRA, PADRAO, base);
    expect(sp.get("owner")).toBe("");
    expect(sp.get("q")).toBe("bia");
    expect(sp.get("sort")).toBe("");
    expect(sp.has("created")).toBe(false);
    expect(lerEstadoDaUrl(new URLSearchParams(sp.toString()), BARRA, PADRAO, ["todos"], base)).toEqual(mexido);
  });

  it("colunas e recolhidas alteradas vão para a URL", () => {
    const mexido = { ...base, colunas: ["nome", "telefone"], recolhidas: [] };
    const sp = estadoParaUrl(mexido, BARRA, PADRAO, base);
    expect(sp.get("cols")).toBe("nome,telefone");
    expect(sp.get("rec")).toBe("");
    expect(lerEstadoDaUrl(new URLSearchParams(sp.toString()), BARRA, PADRAO, ["todos"], base)).toEqual(mexido);
  });

  it("marcador “não salvo” lista o que mudou; página não conta", () => {
    expect(diferencasDaBase({ ...base, pagina: 4 }, base, BARRA)).toEqual([]);
    expect(diferencasDaBase({ ...base, listas: { responsavel: [SEM_VALOR, "u1"] } }, base, BARRA)).toEqual([]);
    expect(diferencasDaBase({ ...base, busca: "x", datas: {}, colunas: ["nome"] }, base, BARRA)).toEqual(["busca", "Criado em", "colunas"]);
  });

  it("id de visão salva é aceito em ?v= mesmo fora da lista de sistema", () => {
    expect(lerEstadoDaUrl(new URLSearchParams(`v=${ID}`), BARRA, PADRAO, ["todos"]).visao).toBe(ID);
    expect(lerEstadoDaUrl(new URLSearchParams("v=qualquer"), BARRA, PADRAO, ["todos"]).visao).toBe("todos");
    expect(estadoParaUrl(estadoVazio(PADRAO), BARRA, PADRAO).toString()).toBe("");
  });
});

describe("campo removido", () => {
  const av: FiltrosDeConsulta = {
    logica: "e",
    grupos: [
      { logica: "e", condicoes: [{ campo: "cf:plano", op: "eq", valor: "x" }, { campo: "email", op: "vazio" }] },
      { logica: "ou", condicoes: [{ campo: "sumiu", op: "vazio" }] },
    ],
  };

  it("acha o personalizado apagado e o id fora do catálogo", () => {
    expect(camposRemovidos(av, "contatos", ["outro"])).toEqual([
      { campo: "cf:plano", rotulo: "campo removido: plano" },
      { campo: "sumiu", rotulo: "campo removido: sumiu" },
    ]);
    expect(camposRemovidos(av, "contatos", ["plano"]).map((c) => c.campo)).toEqual(["sumiu"]);
  });

  it("tirar do filtro remove a condição e o grupo vazio", () => {
    expect(semCamposRemovidos(av, ["cf:plano", "sumiu"])).toEqual({ logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "email", op: "vazio" }] }] });
  });
});

describe("quem vê e quem mexe", () => {
  const eu = { userId: "u1", equipes: ["t1"], admin: false };
  const admin = { userId: "adm", equipes: [], admin: true };

  it("pessoal: só o dono, nem o admin", () => {
    const v = { ownerId: "u2", visibility: "pessoal", teamId: null };
    expect(podeVer(v, eu)).toBe(false);
    expect(podeVer(v, admin)).toBe(false);
    expect(podeVer({ ...v, ownerId: "u1" }, eu)).toBe(true);
  });

  it("equipe: quem está nela; equipe apagada (teamId null) = só o dono", () => {
    expect(podeVer({ ownerId: "u2", visibility: "equipe", teamId: "t1" }, eu)).toBe(true);
    expect(podeVer({ ownerId: "u2", visibility: "equipe", teamId: "t9" }, eu)).toBe(false);
    expect(podeVer({ ownerId: "u2", visibility: "equipe", teamId: null }, eu)).toBe(false);
  });

  it("contrato: todos veem; só dono ou admin mexem", () => {
    const v = { ownerId: "u2", visibility: "contrato", teamId: null };
    expect(podeVer(v, eu)).toBe(true);
    expect(podeMexer(v, eu)).toBe(false);
    expect(podeMexer(v, admin)).toBe(true);
  });

  it("compartilhar: contrato só admin; equipe só a minha", () => {
    expect(conferirVisibilidade("contrato", null, eu)).toMatch(/administra/);
    expect(conferirVisibilidade("contrato", null, admin)).toBeNull();
    expect(conferirVisibilidade("equipe", "t9", eu)).toMatch(/participa/);
    expect(conferirVisibilidade("equipe", "t1", eu)).toBeNull();
    expect(conferirVisibilidade("equipe", null, eu)).toMatch(/equipe/);
  });
});
