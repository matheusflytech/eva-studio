import { describe, it, expect } from "vitest";
import { aplicar, ErroDeOperacao, pontaParaBaixo, pontaParaCima } from "./operacoes";
import { layoutDaAutomacao } from "./layout";
import { validar } from "./validar";
import { exemploProposta } from "./exemplo.test-helpers";

// exemploProposta: gatilho → espera → cond (sim: zap → tarefa; não: nota)

describe("posicionar", () => {
  it("guarda arredondado, recusa passo que não existe e null volta ao automático", () => {
    const d = aplicar(exemploProposta(), { op: "posicionar", posicoes: { zap: { x: 10.4, y: -3.6 }, gatilho: { x: 0, y: 0 } } });
    expect(d.posicoes).toEqual({ zap: { x: 10, y: -4 }, gatilho: { x: 0, y: 0 } });
    expect(() => aplicar(d, { op: "posicionar", posicoes: { xyz: { x: 1, y: 1 } } })).toThrow(ErroDeOperacao);
    expect(() => aplicar(d, { op: "posicionar", posicoes: { zap: { x: NaN, y: 1 } } })).toThrow(ErroDeOperacao);
    expect(aplicar(d, { op: "posicionar", posicoes: null }).posicoes).toBeUndefined();
  });

  it("apagar um ramo leva junto as posições dele", () => {
    const d = aplicar(exemploProposta(), { op: "posicionar", posicoes: { tarefa: { x: 5, y: 5 }, nota: { x: 9, y: 9 } } });
    const sem = aplicar(d, { op: "apagar", id: "cond", manter: "nao" });
    expect(sem.posicoes).toEqual({ nota: { x: 9, y: 9 } });
  });

  it("layout: bloco arrastado fica onde foi solto e o \"+\" dele vai junto", () => {
    const antes = layoutDaAutomacao(exemploProposta());
    const auto = (id: string) => antes.caixas.find((c) => c.id === id)!;
    const d = aplicar(exemploProposta(), { op: "posicionar", posicoes: { tarefa: { x: 1000, y: 500 } } });
    const l = layoutDaAutomacao(d);
    const caixa = (id: string) => l.caixas.find((c) => c.id === id)!;
    expect(caixa("tarefa")).toMatchObject({ x: 1000, y: 500 });
    const dx = 1000 - auto("tarefa").x;
    const dy = 500 - auto("tarefa").y;
    expect(caixa("vazio:tarefa:proximo")).toMatchObject({ x: auto("vazio:tarefa:proximo").x + dx, y: auto("vazio:tarefa:proximo").y + dy });
    // Quem não foi arrastado não sai do lugar.
    expect(caixa("zap")).toMatchObject({ x: auto("zap").x, y: auto("zap").y });
  });
});

describe("subir e descer passo", () => {
  it("subir passa para antes do anterior; o primeiro do fluxo não sobe", () => {
    const d = exemploProposta();
    expect(pontaParaCima(d, "espera")).toBeNull();
    const ponta = pontaParaCima(d, "tarefa")!;
    expect(ponta).toEqual({ de: "cond", saida: "sim" });
    const m = aplicar(d, { op: "mover", id: "tarefa", ponta });
    expect(m.nos.cond).toMatchObject({ sim: "tarefa" });
    expect(m.nos.tarefa).toMatchObject({ proximo: "zap" });
    expect(m.nos.zap).toMatchObject({ proximo: null });
    expect(validar(m).filter((p) => p.nivel === "erro")).toEqual([]);
  });

  it("descer troca com o seguinte; não desce para dentro de um desvio nem no fim", () => {
    const d = exemploProposta();
    expect(pontaParaBaixo(d, "espera")).toBeNull(); // seguinte é condição
    expect(pontaParaBaixo(d, "tarefa")).toBeNull(); // último
    const m = aplicar(d, { op: "mover", id: "zap", ponta: pontaParaBaixo(d, "zap")! });
    expect(m.nos.cond).toMatchObject({ sim: "tarefa" });
    expect(m.nos.tarefa).toMatchObject({ proximo: "zap" });
  });

  it("mover limpa a posição salva do passo (ele cai no lugar novo)", () => {
    const d = aplicar(exemploProposta(), { op: "posicionar", posicoes: { zap: { x: 1, y: 1 } } });
    expect(aplicar(d, { op: "mover", id: "zap", ponta: pontaParaBaixo(d, "zap")! }).posicoes).toEqual({});
  });
});
