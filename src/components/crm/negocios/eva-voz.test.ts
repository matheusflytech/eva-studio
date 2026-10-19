import { describe, expect, it } from "vitest";
import { comemoracao, desdeOntem, gargaloDaConversao, listaDeAtencao, listaHumana, momentos, montarRecado, saudacao, sinalHumano, vazioDaEtapa } from "./eva-voz";
import type { EtapaKanban, NegocioKanban } from "./modelo";

// 20/out/2026 9h em São Paulo (12h UTC).
const AGORA = new Date("2026-10-20T12:00:00Z");

const negocio = (p: Partial<NegocioKanban>): NegocioKanban => ({
  id: p.id ?? "n",
  name: "N",
  amountCents: 100_000,
  probability: 50,
  company: null,
  owner: null,
  contacts: [],
  openTasks: 0,
  expectedClosingAt: null,
  closedAt: null,
  customFields: {},
  createdAt: "2026-10-01T12:00:00Z",
  stageSince: "2026-10-19T12:00:00Z",
  whatsapp: null,
  nextTask: null,
  ...p,
});
const etapa = (type: string, deals: NegocioKanban[]): EtapaKanban => ({ id: type, name: type, type, color: "", probability: 0, totalCents: 0, weightedCents: 0, deals });

describe("saudacao e listaHumana", () => {
  it("pela hora de São Paulo", () => {
    expect(saudacao(AGORA)).toBe("Bom dia");
    expect(saudacao(new Date("2026-10-20T18:00:00Z"))).toBe("Boa tarde");
    expect(saudacao(new Date("2026-10-20T23:30:00Z"))).toBe("Boa noite");
  });
  it("junta nomes como gente", () => {
    expect(listaHumana(["A"])).toBe("A");
    expect(listaHumana(["A", "B"])).toBe("A e B");
    expect(listaHumana(["A", "B", "C"])).toBe("A, B e C");
    expect(listaHumana(["A", "B", "C", "D", "A"])).toBe("A, B, C e mais 1");
  });
});

describe("montarRecado", () => {
  it("cliente esperando resposta vem antes de tudo", () => {
    const r = montarRecado(
      [etapa("open", [negocio({ company: { id: "c", name: "Clínica" }, whatsapp: { conversationId: "x", naoLida: true } })])],
      AGORA,
      "Matheus Paes",
      null
    );
    expect(r.titulo).toBe("Bom dia, Matheus. Tem 1 cliente esperando sua resposta.");
    expect(r.acoes[0].id).toBe("naoLidas");
  });
  it("retornos contam clientes, não tarefas", () => {
    const t = { type: "ligar", text: "x", dueAt: "2026-10-19T12:00:00Z" };
    const empresa = { id: "c", name: "Aurora" };
    const r = montarRecado([etapa("open", [negocio({ id: "1", company: empresa, nextTask: t }), negocio({ id: "2", company: empresa, nextTask: t })])], AGORA, "", null);
    expect(r.titulo).toBe("Bom dia. Hoje o que mais rende é falar com 1 cliente.");
    expect(r.acoes[0].rotulo).toBe("Ver os 2 retornos");
  });
  it("aponta o gargalo quando ele trava de verdade", () => {
    const r = montarRecado([etapa("open", [negocio({})])], AGORA, "Ana", { de: "Negociação", para: "Ganho", taxa: 0.5 });
    expect(r.partes.map((p) => p.texto).join("")).toContain("só 50% avançam");
    expect(r.acoes.some((a) => a.id === "gargalo")).toBe(true);
  });
  it("funil vazio convida a criar", () => {
    expect(montarRecado([etapa("open", [])], AGORA, "Ana", null).acoes[0].id).toBe("novo");
  });
});

describe("momentos e gargalo", () => {
  it("só fatos do funil carregado", () => {
    const ganhos = etapa("won", [negocio({ id: "a", closedAt: "2026-10-20T11:00:00Z", amountCents: 500_000 }), negocio({ id: "b", closedAt: "2026-10-17T12:00:00Z" })]);
    const m = momentos([ganhos, etapa("lost", [])], AGORA);
    expect(m[0]).toBe("Já teve venda hoje");
    expect(m).toContain("2 vendas na semana sem perder nenhum negócio");
  });
  it("maior queda entre etapas vizinhas", () => {
    expect(gargaloDaConversao([{ nome: "A", quantidade: 10 }, { nome: "B", quantidade: 9 }, { nome: "C", quantidade: 3 }])).toEqual({ de: "B", para: "C", taxa: 3 / 9 });
    expect(gargaloDaConversao([{ nome: "A", quantidade: 4 }, { nome: "B", quantidade: 4 }])).toBeNull();
  });
});

describe("variação 2: textos do quadro", () => {
  it("sinal dito como gente", () => {
    expect(sinalHumano("Parado 20 dias", "warn")).toBe("Quieto há 20 dias. Que tal ligar?");
    expect(sinalHumano("Parado 8 dias", "warn")).toBe("Parado há 8 dias");
    expect(sinalHumano("Retorno atrasado 1d", "bad")).toBe("Retorno era ontem");
    expect(sinalHumano("Fechamento passou 28 out", "bad")).toBe("Previsão era 28 out. Remarcar?");
    expect(sinalHumano("Ganho 18 out", "ok")).toBe("Fechou em 18 out");
    expect(sinalHumano("Ligar amanhã 10h", "neu")).toBe("Ligar amanhã 10h");
  });
  it("coluna vazia e comemoração", () => {
    expect(vazioDaEtapa("open", "Diagnóstico", "Qualificação").dica).toBe("Puxe um de Qualificação quando ele estiver pronto.");
    expect(vazioDaEtapa("won", "Ganho", "Negociação").titulo).toBe("A próxima venda aparece aqui.");
    expect(comemoracao("Clínica", 1_740_000, 3)).toEqual({ titulo: "Fechou! Clínica, R$ 17,4 mil.", detalhe: "Já são 3 vendas este mês." });
  });
});

describe("variação 3: o dia", () => {
  it("atenção ordenada pela urgência, com a ação certa", () => {
    const lista = listaDeAtencao(
      [
        etapa("open", [
          negocio({ id: "parado", stageSince: "2026-09-01T12:00:00Z" }),
          negocio({ id: "zap", whatsapp: { conversationId: "c", naoLida: true } }),
          negocio({ id: "retorno", nextTask: { type: "ligar", text: "x", dueAt: "2026-10-18T12:00:00Z" } }),
          negocio({ id: "ok" }),
        ]),
      ],
      AGORA
    );
    expect(lista.map((i) => [i.deal.id, i.acao])).toEqual([
      ["zap", "whatsapp"],
      ["retorno", "retorno"],
      ["parado", "ligar"],
    ]);
    expect(lista[1].motivo).toContain("atrasou 2 dias");
  });
  it("desde ontem só com o que aconteceu nas últimas horas", () => {
    const a = desdeOntem(
      [
        etapa("won", [negocio({ id: "g", company: { id: "c", name: "Clínica" }, closedAt: "2026-10-20T10:00:00Z" })]),
        etapa("open", [negocio({ id: "velho", stageSince: "2026-09-01T12:00:00Z" }), negocio({ id: "mov", stageSince: "2026-10-19T20:00:00Z" })]),
      ],
      AGORA
    );
    expect(a.map((x) => x.id)).toEqual(["gg", "emov"]);
    expect(a[0].quando).toBe("7h00");
    expect(a[1].quando).toBe("Ontem");
  });
});
