import { describe, expect, it } from "vitest";
import { chaveDosRecentes, gravarRecente, lerRecentes, MAX_RECENTES, registrarRecente, type Recente } from "./recentes";

const r = (id: string, tipo: Recente["tipo"] = "negocio"): Recente => ({ tipo, id, titulo: `T ${id}`, caminho: `/negocios/${id}` });

function storage(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
  };
}

describe("recentes", () => {
  it("o aberto agora vai para o topo, sem repetir (mesmo tipo + id)", () => {
    const lista = registrarRecente([r("1"), r("2"), r("3")], r("2"));
    expect(lista.map((x) => x.id)).toEqual(["2", "1", "3"]);
    // Mesmo id, tipo diferente, são registros diferentes.
    expect(registrarRecente([r("1")], r("1", "contato")).length).toBe(2);
  });

  it("guarda no máximo MAX_RECENTES", () => {
    let lista: Recente[] = [];
    for (let i = 0; i < MAX_RECENTES + 5; i++) lista = registrarRecente(lista, r(String(i)));
    expect(lista.length).toBe(MAX_RECENTES);
    expect(lista[0].id).toBe(String(MAX_RECENTES + 4));
  });

  it("um por contrato e por pessoa", () => {
    expect(chaveDosRecentes("c1", "u1")).not.toBe(chaveDosRecentes("c2", "u1"));
    expect(chaveDosRecentes("c1", "u1")).not.toBe(chaveDosRecentes("c1", "u2"));
  });

  it("lê ignorando lixo e sobrevive a armazenamento quebrado", () => {
    const s = storage({ k: JSON.stringify([r("1"), { tipo: "x", id: 2 }, null, r("3", "empresa")]) });
    expect(lerRecentes(s, "k").map((x) => x.id)).toEqual(["1", "3"]);
    expect(lerRecentes(storage({ k: "{não é json" }), "k")).toEqual([]);
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(lerRecentes(quebrado, "k")).toEqual([]);
    expect(() => gravarRecente(quebrado, "k", r("1"))).not.toThrow();
    expect(lerRecentes(null, "k")).toEqual([]);
  });

  it("gravar = ler + registrar + salvar", () => {
    const s = storage();
    gravarRecente(s, "k", r("1"));
    gravarRecente(s, "k", r("2", "contato"));
    expect(lerRecentes(s, "k").map((x) => `${x.tipo}:${x.id}`)).toEqual(["contato:2", "negocio:1"]);
  });
});
