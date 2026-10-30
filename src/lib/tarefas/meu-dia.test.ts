import { describe, expect, it } from "vitest";
import { montarMeuDia, pontuar, resumoDoDia, urgenciaDoSla, valorNormalizado, type ItemDoDia } from "./meu-dia";
import { concluirEProximo, iniciarFila, idAtual, progressoDaFila, pular, removerDaFila, voltar } from "./fila";
import { resolverVisao, responsaveisDaVisao, tarefaNoEscopo, visoesPermitidas } from "./escopo";

// Terça, 20/10/2026, 10:00 em SP.
const AGORA = new Date("2026-10-20T13:00:00Z");
const ctx = { agora: AGORA, maxValorCents: 0 };

function item(id: string, extra: Partial<ItemDoDia> = {}): ItemDoDia {
  return { id, fonte: "tarefa", tipo: "afazer", titulo: id, dueAt: null, prioridade: "normal", criadoEm: new Date("2026-10-01T12:00:00Z"), ...extra };
}

describe("score do Meu dia", () => {
  it("SLA de lead cresce e estoura em 1,2", () => {
    const lead = (min: number) => item("l", { fonte: "primeiro_contato", leadDesde: new Date(AGORA.getTime() - min * 60_000), slaMin: 30 });
    expect(urgenciaDoSla(lead(15), AGORA)).toBeCloseTo(0.5);
    expect(urgenciaDoSla(lead(45), AGORA)).toBe(1.2);
    expect(pontuar(lead(45), ctx)).toBe(48);
  });

  it("cliente esperando resposta pesa mais que tarefa atrasada simples", () => {
    const responder = item("r", { fonte: "responder", tipo: "whatsapp", esperandoDesde: new Date(AGORA.getTime() - 2 * 3_600_000) });
    const atrasada = item("a", { dueAt: new Date("2026-10-19T13:00:00Z") });
    expect(pontuar(responder, ctx)).toBeGreaterThan(pontuar(atrasada, ctx));
    // 1 dia de atraso = 1/3 → 20/3
    expect(pontuar(atrasada, ctx)).toBeCloseTo(6.67, 1);
    // 3+ dias = teto
    expect(pontuar(item("x", { dueAt: new Date("2026-10-10T13:00:00Z") }), ctx)).toBe(20);
  });

  it("valor normalizado por log, etapa, risco e prioridade", () => {
    expect(valorNormalizado(0, 100_00)).toBe(0);
    expect(valorNormalizado(100_000_00, 100_000_00)).toBe(1);
    expect(valorNormalizado(1_000_00, 100_000_00)).toBeGreaterThan(0.5);
    const cheio = item("c", { valorCents: 50_000_00, etapaProgresso: 1, risco: 1, prioridade: "alta" });
    expect(pontuar(cheio, { agora: AGORA, maxValorCents: 50_000_00 })).toBe(15 + 10 + 10 + 15);
  });

  it("ranking, fixos no topo e desempate por prazo", () => {
    const dia = montarMeuDia(
      [
        item("reuniao", { tipo: "reuniao", dueAt: new Date("2026-10-20T17:00:00Z") }),
        item("visita-cedo", { tipo: "visita", dueAt: new Date("2026-10-20T14:00:00Z") }),
        item("b", { dueAt: new Date("2026-10-20T19:00:00Z") }),
        item("a", { dueAt: new Date("2026-10-20T18:00:00Z") }),
        item("alta", { prioridade: "alta", dueAt: new Date("2026-10-20T20:00:00Z") }),
      ],
      AGORA
    );
    expect(dia.fixos.map((f) => f.item.id)).toEqual(["visita-cedo", "reuniao"]);
    expect(dia.agora.map((f) => f.item.id)).toEqual(["alta", "a", "b"]);
  });

  it("capacidade = minutos livres − fixos − 15%; excedente vai para amanhã", () => {
    // 17:00 SP → 60 min até as 18h; sem fixos → 51 min livres
    const tarde = new Date("2026-10-20T20:00:00Z");
    const dia = montarMeuDia(
      [
        item("v1", { tipo: "visita", prioridade: "alta" }), // 60 min, não cabe
        item("l1", { tipo: "ligar" }),
        item("l2", { tipo: "ligar" }),
        item("w1", { tipo: "whatsapp" }),
      ],
      tarde
    );
    expect(dia.capacidade.livres).toBe(51);
    expect(dia.agora.map((p) => p.item.id)).toEqual(["l1", "l2", "w1"]);
    expect(dia.provavelmenteAmanha.map((p) => p.item.id)).toEqual(["v1"]);
    expect(dia.capacidade.planejados).toBe(23);
    expect(dia.capacidade.excedentes).toBe(60);
  });

  it("fixo que ainda vai acontecer come a capacidade", () => {
    // 10h; 8h de expediente = 480; reunião 30 min às 14h → (480 − 30) × 0,85 = 382
    const dia = montarMeuDia([item("r", { tipo: "reuniao", dueAt: new Date("2026-10-20T17:00:00Z") })], AGORA);
    expect(dia.capacidade.fixosMin).toBe(30);
    expect(dia.capacidade.livres).toBe(382);
  });

  it("filas por tipo, maior primeiro", () => {
    const dia = montarMeuDia(
      [item("w1", { tipo: "whatsapp" }), item("w2", { tipo: "whatsapp" }), item("l1", { tipo: "ligar" }), item("r1", { fonte: "responder", tipo: "whatsapp", esperandoDesde: AGORA })],
      AGORA
    );
    expect(dia.filas[0]).toEqual({ tipo: "whatsapp", rotulo: "Fila: 3 WhatsApps", ids: ["r1", "w1", "w2"] });
    expect(dia.filas[1].rotulo).toBe("Fila: 1 ligação");
  });

  it("resumo do dia reutilizável (digest)", () => {
    const dia = montarMeuDia(
      [
        item("r", { tipo: "reuniao", dueAt: new Date("2026-10-20T17:00:00Z") }),
        item("t1", { dueAt: new Date("2026-10-19T13:00:00Z") }),
        item("t2"),
        item("resp", { fonte: "responder", tipo: "whatsapp", esperandoDesde: AGORA }),
        item("lead", { fonte: "primeiro_contato", leadDesde: AGORA }),
        item("np", { fonte: "proximo_passo" }),
      ],
      AGORA
    );
    const r = resumoDoDia(dia, AGORA);
    expect(r).toMatchObject({ reunioes: 1, tarefas: 2, atrasadas: 1, aguardandoResposta: 1, leadsNovos: 1, negociosEmRisco: 1 });
    expect(r.texto).toBe(
      "Hoje: 1 compromisso, 2 tarefas (1 atrasada), 1 cliente esperando resposta, 1 lead novo aguardando e 1 negócio sem próximo passo."
    );
    expect(resumoDoDia(montarMeuDia([], AGORA), AGORA).texto).toBe("Nada pendente para hoje.");
  });
});

describe("fila: Concluir e próximo", () => {
  it("anda, pula e termina", () => {
    let f = iniciarFila(["a", "b", "c"]);
    expect(idAtual(f)).toBe("a");
    f = concluirEProximo(f);
    expect(idAtual(f)).toBe("b");
    f = pular(f);
    expect(idAtual(f)).toBe("c");
    f = concluirEProximo(f);
    expect(idAtual(f)).toBeNull();
    expect(progressoDaFila(f)).toEqual({ feitos: 2, total: 3 });
    expect(f.pulados).toEqual(["b"]);
  });

  it("começa no registro escolhido e ignora repetidos", () => {
    const f = iniciarFila(["a", "b", "b", "c"], "b");
    expect(f.ids).toEqual(["a", "b", "c"]);
    expect(idAtual(f)).toBe("b");
    expect(idAtual(iniciarFila([]))).toBeNull();
  });

  it("voltar reabre o pulado e depois segue para o que estava aberto", () => {
    let f = iniciarFila(["a", "b", "c", "d"]);
    f = pular(f); // a pulado, em b
    f = pular(f); // b pulado, em c
    f = voltar(f); // último pulado: b
    expect(idAtual(f)).toBe("b");
    expect(f.pulados).toEqual(["a"]);
    f = concluirEProximo(f);
    expect(idAtual(f)).toBe("c");
    f = voltar(f, "a");
    expect(idAtual(f)).toBe("a");
    f = concluirEProximo(f); // a concluído; segue no c
    expect(idAtual(f)).toBe("c");
    expect(voltar(f)).toBe(f); // sem pulados
    expect(voltar(f, "b")).toBe(f); // concluído não volta
  });

  it("item que some da lista não perde a posição", () => {
    let f = iniciarFila(["a", "b", "c"]);
    f = concluirEProximo(f); // em b
    f = removerDaFila(f, "a");
    expect(idAtual(f)).toBe("b");
    f = removerDaFila(f, "b"); // o aberto sumiu → c
    expect(idAtual(f)).toBe("c");
    expect(removerDaFila(f, "zzz")).toBe(f);
  });
});

describe("escopo Minhas / Equipe / Todas", () => {
  it("teto pelo escopo de negócios do papel", () => {
    expect(visoesPermitidas("proprios")).toEqual(["minhas"]);
    expect(visoesPermitidas("equipe")).toEqual(["minhas", "equipe"]);
    expect(visoesPermitidas(undefined)).toEqual(["minhas", "equipe", "todas"]);
    expect(resolverVisao("todas", "equipe")).toBe("equipe");
    expect(resolverVisao("todas", "proprios")).toBe("minhas");
    expect(resolverVisao("lixo", "todos")).toBe("minhas");
  });

  it("responsáveis por visão", () => {
    expect(responsaveisDaVisao("minhas", "u", ["x"])).toEqual(["u"]);
    expect(responsaveisDaVisao("equipe", "u", ["x", "u"])).toEqual(["u", "x"]);
    expect(responsaveisDaVisao("todas", "u", [])).toBeNull();
  });

  it("mexer na tarefa só dentro do teto", () => {
    expect(tarefaNoEscopo("x", "todos", "u", [])).toBe(true);
    expect(tarefaNoEscopo(null, "todos", "u", [])).toBe(true);
    expect(tarefaNoEscopo("x", "proprios", "u", ["x"])).toBe(false);
    expect(tarefaNoEscopo("u", "proprios", "u", [])).toBe(true);
    expect(tarefaNoEscopo("x", "equipe", "u", ["x"])).toBe(true);
    expect(tarefaNoEscopo(null, "equipe", "u", ["x"])).toBe(false);
  });
});
