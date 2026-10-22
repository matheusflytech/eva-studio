import { describe, it, expect } from "vitest";
import { MODELOS } from "./modelos";
import { validar } from "./validar";
import { layoutDaAutomacao, NO_ALTURA } from "./layout";
import { exemploProposta } from "./exemplo.test-helpers";
import { definicaoVazia } from "./tipos";

describe("modelos da galeria", () => {
  it("todos têm estrutura válida; só faltam as escolhas do contrato", () => {
    for (const m of MODELOS) {
      const d = m.definicao();
      expect(d.objeto).toBe(m.objeto);
      const erros = validar(d).filter((p) => p.nivel === "erro");
      // Nada de passo solto, ciclo ou ação que não vale: só "falta X".
      expect(erros.every((e) => /falta /.test(e.mensagem)), `${m.id}: ${erros.map((e) => e.mensagem).join(" | ")}`).toBe(true);
    }
  });

  it("cada chamada devolve uma cópia nova (editar uma não muda o modelo)", () => {
    const a = MODELOS[0].definicao();
    a.nos.n1 = { id: "n1", tipo: "fim" };
    expect(MODELOS[0].definicao().nos.n1.tipo).toBe("acao");
  });

  it("gatilho de relógio entra sempre", () => {
    for (const m of MODELOS.filter((x) => ["deal.stale", "contact.date_relative", "conversation.waiting_human"].includes(x.definicao().gatilho?.tipo ?? ""))) {
      expect(m.reinscricao, m.id).toBe("sempre");
    }
  });
});

describe("layout esquerda → direita", () => {
  it("gatilho na coluna 0, ramos empilhados, saídas vazias viram '+'", () => {
    const l = layoutDaAutomacao(exemploProposta());
    const c = Object.fromEntries(l.caixas.map((x) => [x.id, x]));
    expect(c.gatilho.x).toBe(0);
    expect(c.espera.x).toBeGreaterThan(c.gatilho.x);
    expect(c.cond.x).toBeGreaterThan(c.espera.x);
    // zap e nota (ramos da condição) na mesma coluna, um em cima do outro.
    expect(c.zap.x).toBe(c.nota.x);
    expect(Math.abs(c.zap.y - c.nota.y)).toBeGreaterThanOrEqual(NO_ALTURA);
    // A condição fica no meio dos ramos.
    expect(c.cond.y).toBeGreaterThan(Math.min(c.zap.y, c.nota.y));
    expect(c.cond.y).toBeLessThan(Math.max(c.zap.y, c.nota.y));
    const vazios = l.caixas.filter((x) => x.tipo === "vazio").map((x) => `${x.ponta!.de}:${x.ponta!.saida}`);
    expect(vazios.sort()).toEqual(["nota:proximo", "tarefa:proximo"]);
    const sim = l.ligacoes.find((x) => x.de === "cond" && x.saida === "sim")!;
    expect(sim).toMatchObject({ para: "zap", nome: "Sim", paraVazio: false });
  });

  it("automação vazia: gatilho e um '+'", () => {
    const l = layoutDaAutomacao(definicaoVazia("deal"));
    expect(l.caixas.map((x) => x.tipo)).toEqual(["gatilho", "vazio"]);
    expect(l.ligacoes[0].ponta).toEqual({ de: "gatilho", saida: "proximo" });
  });
});
