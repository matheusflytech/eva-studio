import { describe, it, expect } from "vitest";
import { aplicar, ErroDeOperacao, paiDe, subarvore } from "./operacoes";
import { validar } from "./validar";
import { exemploProposta } from "./exemplo.test-helpers";
import type { Definicao } from "./tipos";

const erros = (d: Definicao) => validar(d).filter((p) => p.nivel === "erro");

describe("operações", () => {
  it("monta o exemplo sem pendência de estrutura", () => {
    const d = exemploProposta();
    expect(d.inicio).toBe("espera");
    expect(Object.keys(d.nos)).toHaveLength(5);
    expect(erros(d)).toEqual([]);
  });

  it("inserir no meio: o que vinha depois passa para a saída principal do passo novo", () => {
    const d = aplicar(exemploProposta(), {
      op: "inserir",
      ponta: { de: "gatilho", saida: "proximo" },
      no: { id: "tag", tipo: "acao", acao: "contact.add_tag", config: { tag: "t1" }, proximo: "lixo" },
    });
    expect(d.inicio).toBe("tag");
    expect(d.nos.tag).toMatchObject({ proximo: "espera" });
    expect(paiDe(d, "espera")).toEqual({ de: "tag", saida: "proximo" });
  });

  it("inserir condição no meio: o resto pode ir para o Não", () => {
    const d = aplicar(exemploProposta(), {
      op: "inserir",
      ponta: { de: "zap", saida: "proximo" },
      no: { id: "c2", tipo: "condicao", regra: { grupos: [] }, sim: null, nao: null },
      seguintesPor: "nao",
    });
    expect(d.nos.c2).toMatchObject({ sim: null, nao: "tarefa" });
  });

  it("apagar passo simples religa pai e filho", () => {
    const d = aplicar(exemploProposta(), { op: "apagar", id: "espera" });
    expect(d.inicio).toBe("cond");
    expect(d.nos.espera).toBeUndefined();
  });

  it("apagar condição mantém o ramo escolhido e apaga o outro inteiro", () => {
    const d = aplicar(exemploProposta(), { op: "apagar", id: "cond", manter: "nao" });
    expect(d.nos.espera).toMatchObject({ proximo: "nota" });
    expect(d.nos.zap).toBeUndefined();
    expect(d.nos.tarefa).toBeUndefined();
    expect(erros(d)).toEqual([]);
  });

  it("duplicar cria cópia logo depois", () => {
    const d = aplicar(exemploProposta(), { op: "duplicar", id: "tarefa" });
    const copia = (d.nos.tarefa as { proximo: string }).proximo;
    expect(copia).toMatch(/^n_/);
    expect(d.nos[copia]).toMatchObject({ acao: "task.create" });
  });

  it("mover leva para outra ligação sem deixar buraco", () => {
    const d = aplicar(exemploProposta(), { op: "mover", id: "tarefa", ponta: { de: "nota", saida: "proximo" } });
    expect(d.nos.zap).toMatchObject({ proximo: null });
    expect(d.nos.nota).toMatchObject({ proximo: "tarefa" });
    expect(erros(d)).toEqual([]);
  });

  it("atualizar não muda saídas nem tipo", () => {
    const d = aplicar(exemploProposta(), { op: "atualizar", id: "zap", patch: { proximo: "espera", tipo: "fim", rotulo: "Lembrete" } });
    expect(d.nos.zap).toMatchObject({ tipo: "acao", proximo: "tarefa", rotulo: "Lembrete" });
  });

  it("caminho de erro: liga e desliga (desligar apaga o ramo)", () => {
    let d = aplicar(exemploProposta(), { op: "atualizar", id: "zap", patch: { comErro: true } });
    expect(d.nos.zap).toMatchObject({ erro: null });
    d = aplicar(d, {
      op: "inserir",
      ponta: { de: "zap", saida: "erro" },
      no: { id: "aviso", tipo: "acao", acao: "team.notify", config: { mensagem: "falhou" }, proximo: null },
    });
    expect(d.nos.zap).toMatchObject({ erro: "aviso" });
    expect(() => aplicar(d, { op: "mover", id: "zap", ponta: { de: "nota", saida: "proximo" } })).toThrow(/erro/);
    d = aplicar(d, { op: "atualizar", id: "zap", patch: { comErro: false } });
    expect("erro" in d.nos.zap).toBe(false);
    expect(d.nos.aviso).toBeUndefined();
  });

  it("caminhos: adicionar e remover (remover apaga o ramo)", () => {
    let d = aplicar(exemploProposta(), {
      op: "inserir",
      ponta: { de: "nota", saida: "proximo" },
      no: { id: "cam", tipo: "caminhos", caminhos: [{ id: "c_a", nome: "Quente", regra: { grupos: [] }, proximo: null }], senao: null },
    });
    d = aplicar(d, { op: "adicionar_caminho", id: "cam" });
    const segundo = (d.nos.cam as { caminhos: { id: string }[] }).caminhos[1].id;
    d = aplicar(d, { op: "inserir", ponta: { de: "cam", saida: `caminho:${segundo}` }, no: { id: "x", tipo: "fim" } });
    expect(d.nos.x).toBeDefined();
    d = aplicar(d, { op: "remover_caminho", id: "cam", caminhoId: segundo });
    expect(d.nos.x).toBeUndefined();
    expect(() => aplicar(d, { op: "remover_caminho", id: "cam", caminhoId: "c_a" })).toThrow(ErroDeOperacao);
  });

  it("fim só no fim do caminho; id repetido é recusado", () => {
    expect(() => aplicar(exemploProposta(), { op: "inserir", ponta: { de: "gatilho", saida: "proximo" }, no: { id: "f", tipo: "fim" } })).toThrow(/fim do caminho/);
    expect(() => aplicar(exemploProposta(), { op: "inserir", ponta: { de: "nota", saida: "proximo" }, no: { id: "zap", tipo: "fim" } })).toThrow(/id/);
  });

  it("subárvore do nó", () => {
    expect([...subarvore(exemploProposta(), "cond")].sort()).toEqual(["cond", "nota", "tarefa", "zap"]);
  });
});
