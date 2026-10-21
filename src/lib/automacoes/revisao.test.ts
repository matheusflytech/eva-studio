import { describe, it, expect } from "vitest";
import { avaliarCondicao, avaliarRegra, data, lerCaminho, numero } from "./condicoes";
import { aplicar, ErroDeOperacao } from "./operacoes";
import { validar } from "./validar";
import { renderizar, problemasDasVariaveis } from "./variaveis";
import { fraseDaAutomacao, fraseDaRegra } from "./frase";
import { exemploProposta } from "./exemplo.test-helpers";
import type { Definicao, No, Operador } from "./tipos";

// Um teste por achado da revisão da parte A (21/10/2026).

const ok = (v: unknown, operador: Operador, valor?: unknown, agora = new Date("2026-10-21T12:00:00Z")) =>
  avaliarCondicao({ campo: "x", operador, valor }, { x: v }, agora);
const mensagens = (d: Definicao) => validar(d).map((p) => `${p.nivel}:${p.no}:${p.mensagem}`);

describe("condições", () => {
  it("1: texto solto não vira data", () => {
    expect(ok("Proposta 2", "igual", "Fase 2")).toBe(false);
    expect(ok("abc 10", "maior", "x 9")).toBe(false);
    expect(ok("5", "antes", "2026-01-01")).toBe(false);
    expect(data("10/11/2026")).toBeNull();
    expect(data("Etapa 2")).toBeNull();
  });

  it("2: grupo vazio não faz o OU valer sempre", () => {
    const regra = { grupos: [{ condicoes: [] }, { condicoes: [{ campo: "x", operador: "igual" as const, valor: "zzz" }] }] };
    expect(avaliarRegra(regra, { x: "abc" })).toBe(false);
    expect(avaliarRegra({ grupos: [{ condicoes: [] }] }, { x: "abc" })).toBe(true);
  });

  it("12: data sem hora vale o dia inteiro em São Paulo", () => {
    expect(ok("2026-10-21T15:00:00-03:00", "entre", ["2026-10-01", "2026-10-21"])).toBe(true);
    expect(ok("2026-10-21T23:30:00-03:00", "depois", "2026-10-21")).toBe(false);
    expect(ok("2026-10-22T00:10:00-03:00", "depois", "2026-10-21")).toBe(true);
    expect(ok("2026-10-20T23:59:00-03:00", "antes", "2026-10-21")).toBe(true);
    expect(ok("2026-10-21T00:01:00-03:00", "antes", "2026-10-21")).toBe(false);
  });

  it("13: milissegundos contam como data", () => {
    const agora = new Date("2026-10-21T12:00:00Z");
    expect(ok(agora.getTime() - 3_600_000, "ultimos_dias", 1, agora)).toBe(true);
    expect(ok(Date.parse("2026-10-25T00:00:00Z"), "depois", "2026-10-21")).toBe(true);
  });

  it("14: número estrito e formato brasileiro", () => {
    expect(numero("0x10")).toBeNull();
    expect(numero("1e3")).toBeNull();
    expect(numero("1.500")).toBe(1500);
    expect(numero("1.500,50")).toBe(1500.5);
    expect(numero("10,5")).toBe(10.5);
    expect(numero("10.5")).toBe(10.5);
    expect(ok("0x10", "igual", "16")).toBe(false);
  });

  it("17: caminho não lê propriedade herdada", () => {
    expect(lerCaminho({ contato: {} }, "contato.constructor")).toBeUndefined();
    expect(renderizar("{{contato.constructor}}", { contato: {} }).texto).toBe("");
    expect(lerCaminho({ l: [1, 2] }, "l.length")).toBeUndefined();
  });
});

describe("variáveis e frase", () => {
  it("11: dia sem hora não volta um dia", () => {
    expect(renderizar("{{d | data}}", { d: "2026-10-21" }).texto).toBe("21/10/2026");
    const d = exemploProposta();
    d.nos.espera = { id: "espera", tipo: "espera", config: { modo: "ate_data", data: "2026-12-25" }, proximo: "cond" };
    expect(fraseDaAutomacao(d)).toContain("esperar até 25/12/2026");
  });

  it("15: moeda de vazio continua vazio e o padrão vale", () => {
    expect(renderizar('{{v | moeda | padrao:"-"}}', { v: null }).texto).toBe("-");
    expect(renderizar('{{v | moeda | padrao:"-"}}', { v: "" }).texto).toBe("-");
    expect(renderizar("{{v | moeda}}", { v: "abc" }).texto).toBe("abc");
  });

  it("16: variável mal escrita e filtro desconhecido viram problema", () => {
    expect(problemasDasVariaveis("{{ a | Upper }}")).toHaveLength(1);
    expect(problemasDasVariaveis("{{ a|padrao:'x' }}")).toHaveLength(1);
    expect(problemasDasVariaveis("{{ contato.campo-x }}")).toHaveLength(1);
    expect(problemasDasVariaveis("{{ a | xyz }}")[0]).toMatch(/Filtro desconhecido/);
    expect(problemasDasVariaveis('{{ a | primeiro_nome | padrao:"x" }}')).toEqual([]);
    const d = exemploProposta();
    d.nos.tarefa = { ...d.nos.tarefa, config: { texto: "Ligar {{ contato.Nome | Upper }}" } } as No;
    expect(mensagens(d).some((m) => m.startsWith("erro:tarefa:Variável mal escrita"))).toBe(true);
  });

  it("22: lista de etapas na frase sai com os nomes", () => {
    const d = exemploProposta();
    const nomes = { etapa: (id: string) => ({ s1: "Novo", s2: "Proposta" })[id] };
    expect(fraseDaRegra(d, { grupos: [{ condicoes: [{ campo: "registro.stage_id", operador: "em", valor: ["s1", "s2"] }] }] }, nomes)).toBe("Etapa é um de Novo, Proposta");
  });

  it("frase usa os padrões do catálogo quando a config está vazia", () => {
    const d = { ...exemploProposta(), gatilho: { tipo: "deal.stale", config: {} } };
    expect(fraseDaAutomacao(d)).toMatch(/^Quando um negócio ficar parado 7 dias:/);
  });
});

describe("operações", () => {
  it("4 e 10: atualizar só aceita as chaves do tipo do nó", () => {
    const d = exemploProposta();
    expect(aplicar(d, { op: "atualizar", id: "cond", patch: { caminhos: null } }).nos.cond).not.toHaveProperty("caminhos");
    expect(aplicar(d, { op: "atualizar", id: "espera", patch: { comErro: true } }).nos.espera).not.toHaveProperty("comErro");
    const cam = aplicar(d, {
      op: "inserir",
      ponta: { de: "nota", saida: "proximo" },
      no: { id: "cam", tipo: "caminhos", caminhos: [{ id: "c1", nome: "A", regra: { grupos: [] }, proximo: null }], senao: null },
    });
    expect(() => aplicar(cam, { op: "atualizar", id: "cam", patch: { caminhos: null } })).toThrow(ErroDeOperacao);
  });

  it("5: caminhos com id repetido no atualizar é recusado; reordenar mantém os destinos", () => {
    let d = aplicar(exemploProposta(), {
      op: "inserir",
      ponta: { de: "nota", saida: "proximo" },
      no: {
        id: "cam",
        tipo: "caminhos",
        caminhos: [
          { id: "c1", nome: "A", regra: { grupos: [] }, proximo: null },
          { id: "c2", nome: "B", regra: { grupos: [] }, proximo: null },
        ],
        senao: null,
      },
    });
    d = aplicar(d, { op: "inserir", ponta: { de: "cam", saida: "caminho:c1" }, no: { id: "x1", tipo: "fim" } });
    d = aplicar(d, { op: "inserir", ponta: { de: "cam", saida: "caminho:c2" }, no: { id: "x2", tipo: "fim" } });
    const caminhos = (d.nos.cam as Extract<No, { tipo: "caminhos" }>).caminhos;
    expect(() => aplicar(d, { op: "atualizar", id: "cam", patch: { caminhos: [caminhos[0], caminhos[0]] } })).toThrow(ErroDeOperacao);
    const reordenado = aplicar(d, { op: "atualizar", id: "cam", patch: { caminhos: [{ ...caminhos[1], nome: "B2" }, caminhos[0]] } });
    expect((reordenado.nos.cam as Extract<No, { tipo: "caminhos" }>).caminhos.map((c) => [c.id, c.nome, c.proximo])).toEqual([
      ["c2", "B2", "x2"],
      ["c1", "A", "x1"],
    ]);
  });

  it("6 e 7: nó novo com caminho repetido, tipo desconhecido ou id reservado é recusado", () => {
    const d = exemploProposta();
    const ponta = { de: "nota", saida: "proximo" };
    expect(() =>
      aplicar(d, {
        op: "inserir",
        ponta,
        no: { id: "cam", tipo: "caminhos", caminhos: [{ id: "k", nome: "A", regra: { grupos: [] }, proximo: null }, { id: "k", nome: "B", regra: { grupos: [] }, proximo: null }], senao: null },
      })
    ).toThrow(/id único/);
    expect(() => aplicar(d, { op: "inserir", ponta, no: { id: "y", tipo: "xyz" } as unknown as No })).toThrow(/desconhecido/);
    expect(() => aplicar(d, { op: "inserir", ponta, no: { id: "gatilho", tipo: "fim" } })).toThrow(/Id de passo/);
  });

  it("8: apagar com ramo inexistente não apaga nada", () => {
    expect(() => aplicar(exemploProposta(), { op: "apagar", id: "cond", manter: "xxx" })).toThrow(/ramo/);
  });

  it("9: mover mantém o caminho de erro ligado (vazio)", () => {
    let d = aplicar(exemploProposta(), { op: "atualizar", id: "tarefa", patch: { comErro: true } });
    d = aplicar(d, { op: "mover", id: "tarefa", ponta: { de: "nota", saida: "proximo" } });
    expect(d.nos.tarefa).toMatchObject({ erro: null });
    expect(d.nos.nota).toMatchObject({ proximo: "tarefa" });
  });
});

describe("validação", () => {
  it("3: JSON malformado vira pendência, não exceção", () => {
    const casos: Definicao[] = [
      { ...exemploProposta(), nos: { ...exemploProposta().nos, nota: { id: "nota", tipo: "xyz" } as unknown as No } },
      { ...exemploProposta(), nos: { ...exemploProposta().nos, cond: { id: "cond", tipo: "condicao", regra: { grupos: [{}] }, sim: null, nao: null } as unknown as No } },
      { ...exemploProposta(), nos: { ...exemploProposta().nos, cond: { id: "cond", tipo: "caminhos", caminhos: null, senao: null } as unknown as No } },
      { ...exemploProposta(), nos: { ...exemploProposta().nos, espera: { id: "espera", tipo: "esperar_evento", evento: "x", aconteceu: null, esgotou: null } as unknown as No } },
      { ...exemploProposta(), nos: null } as unknown as Definicao,
    ];
    for (const d of casos) {
      expect(() => validar(d)).not.toThrow();
      expect(validar(d).some((p) => p.nivel === "erro")).toBe(true);
    }
  });

  it("2: grupo vazio ao lado de outro gera aviso", () => {
    const d = exemploProposta();
    d.nos.cond = { ...d.nos.cond, regra: { grupos: [{ condicoes: [] }, { condicoes: [{ campo: "registro.name", operador: "igual", valor: "x" }] }] } } as No;
    expect(mensagens(d)).toContain("aviso:cond:Condição: há grupo sem condição (é ignorado).");
  });

  it("18: cliente respondeu no esperar evento: sem aviso da janela", () => {
    const d = exemploProposta();
    d.nos.espera = { id: "espera", tipo: "esperar_evento", evento: "message.received", prazo: { quantidade: 3, unidade: "dias" }, aconteceu: "cond", esgotou: null };
    d.nos.zap = { ...d.nos.zap, config: { agente: "a1", modo: "texto", texto: "Oi" } } as No;
    expect(mensagens(d).some((m) => m.startsWith("aviso:zap:"))).toBe(false);
    // Pelo "tempo esgotado" o aviso continua.
    d.nos.espera = { ...d.nos.espera, aconteceu: null, esgotou: "cond" } as No;
    expect(mensagens(d).some((m) => m.startsWith("aviso:zap:"))).toBe(true);
  });

  it("19: quantidade inválida não desliga o aviso dos passos seguintes", () => {
    const d = exemploProposta();
    d.nos.espera = { id: "espera", tipo: "espera", config: { modo: "duracao", quantidade: undefined as unknown as number, unidade: "dias" }, proximo: "cond" };
    d.nos.cond = { ...d.nos.cond, sim: "z0" } as No;
    d.nos.z0 = { id: "z0", tipo: "espera", config: { modo: "duracao", quantidade: 2, unidade: "dias" }, proximo: "zap" };
    d.nos.zap = { ...d.nos.zap, config: { agente: "a1", modo: "texto", texto: "Oi" } } as No;
    expect(mensagens(d).some((m) => m.startsWith("aviso:zap:"))).toBe(true);
  });

  it("20: variável de passo posterior em condição e em espera relativa", () => {
    const d = exemploProposta();
    d.nos.cond = { ...d.nos.cond, regra: { grupos: [{ condicoes: [{ campo: "passos.tarefa.id", operador: "preenchido" }] }] } } as No;
    d.nos.espera = { id: "espera", tipo: "espera", config: { modo: "relativa_campo", campo: "passos.nota.data", dias: 0 }, proximo: "cond" };
    const m = mensagens(d);
    expect(m).toContain("erro:cond:A variável {{passos.tarefa.id}} usa um passo que não vem antes deste.");
    expect(m).toContain("erro:espera:A variável {{passos.nota.data}} usa um passo que não vem antes deste.");
  });

  it("21: operandos de entre, últimos dias e datas", () => {
    const comCondicao = (operador: Operador, valor: unknown) => {
      const d = exemploProposta();
      d.nos.cond = { ...d.nos.cond, regra: { grupos: [{ condicoes: [{ campo: "registro.created_at", operador, valor }] }] } } as No;
      return mensagens(d).filter((m) => m.startsWith("erro:cond:"));
    };
    expect(comCondicao("entre", "5")).toHaveLength(1);
    expect(comCondicao("entre", ["2026-10-01", "2026-10-21"])).toHaveLength(0);
    expect(comCondicao("ultimos_dias", "abc")).toHaveLength(1);
    expect(comCondicao("ultimos_dias", "7")).toHaveLength(0);
    expect(comCondicao("antes", "10/11/2026")).toHaveLength(1);
    expect(comCondicao("antes", "{{gatilho.data}}")).toHaveLength(0);
  });
});
