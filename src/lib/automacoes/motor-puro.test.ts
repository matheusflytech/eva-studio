import { describe, it, expect } from "vitest";
import { dentroDaJanela, ehDiaUtil, ehFeriado, fimDaDuracao, pascoa, proximaJanela, somarDiasUteis } from "./calendario";
import { alvosDoEvento, gatilhoCasa, palavrasDoTexto, type EventoParaCasar } from "./casar";
import { decidir, fimDaEspera } from "./interpretar";
import { exemploProposta } from "./exemplo.test-helpers";
import type { Definicao, No } from "./tipos";

// Horários em São Paulo (UTC-3).
const sp = (s: string) => new Date(`${s}-03:00`);

describe("calendário", () => {
  it("Páscoa e Sexta-feira Santa; feriados fixos", () => {
    expect(pascoa(2026)).toEqual({ ano: 2026, mes: 4, dia: 5 });
    expect(ehFeriado({ ano: 2026, mes: 4, dia: 3 })).toBe(true);
    expect(ehFeriado({ ano: 2026, mes: 11, dia: 20 })).toBe(true);
    expect(ehDiaUtil({ ano: 2026, mes: 10, dia: 21 })).toBe(true); // quarta
    expect(ehDiaUtil({ ano: 2026, mes: 10, dia: 24 })).toBe(false); // sábado
    expect(ehDiaUtil({ ano: 2026, mes: 10, dia: 12 })).toBe(false); // Nossa Senhora Aparecida
  });

  it("dias úteis pulam fim de semana e feriado, mantendo a hora", () => {
    // Sexta 30/10 10h + 2 dias úteis: seg 02/11 é feriado → ter 03, qua 04.
    expect(somarDiasUteis(sp("2026-10-30T10:00:00"), 2).toISOString()).toBe(sp("2026-11-04T10:00:00").toISOString());
    expect(fimDaDuracao(sp("2026-10-21T10:00:00"), 30, "minutos").toISOString()).toBe(sp("2026-10-21T10:30:00").toISOString());
  });

  it("horário comercial: seg–sáb 8h–20h, sem feriado", () => {
    expect(dentroDaJanela(sp("2026-10-21T10:00:00"))).toBe(true);
    expect(dentroDaJanela(sp("2026-10-21T20:00:00"))).toBe(false);
    expect(dentroDaJanela(sp("2026-10-25T10:00:00"))).toBe(false); // domingo
    expect(proximaJanela(sp("2026-10-21T07:15:00")).toISOString()).toBe(sp("2026-10-21T08:00:00").toISOString());
    expect(proximaJanela(sp("2026-10-24T21:00:00")).toISOString()).toBe(sp("2026-10-26T08:00:00").toISOString()); // sáb noite → seg
    expect(proximaJanela(sp("2026-11-01T12:00:00")).toISOString()).toBe(sp("2026-11-03T08:00:00").toISOString()); // dom → (seg feriado) → ter
  });
});

const ev = (over: Partial<EventoParaCasar>): EventoParaCasar => ({ tipo: "deal.stage_changed", objeto: "deal", objetoId: "d1", dados: {}, ...over });

describe("casamento do gatilho", () => {
  const casa = (tipo: string, config: Record<string, unknown>, e: EventoParaCasar, registro?: Record<string, unknown>) =>
    gatilhoCasa({ tipo, config }, e, { automacaoId: "a1", registro });

  it("entrou na etapa: criação, movimento ou ambos", () => {
    const criado = ev({ tipo: "deal.created", dados: { to_stage_id: "s1" } });
    const movido = ev({ dados: { from_stage_id: "s0", to_stage_id: "s1" } });
    expect(casa("deal.stage_entered", { etapa: "s1", quando: "ambos" }, criado)).toBe(true);
    expect(casa("deal.stage_entered", { etapa: "s1", quando: "movimento" }, criado)).toBe(false);
    expect(casa("deal.stage_entered", { etapa: "s1", quando: "criacao" }, movido)).toBe(false);
    expect(casa("deal.stage_entered", { etapa: "s1" }, movido)).toBe(true);
    expect(casa("deal.stage_entered", { etapa: "s2" }, movido)).toBe(false);
    expect(casa("deal.stage_left", { etapa: "s0" }, movido)).toBe(true);
  });

  it("evento de outro tipo ou objeto não casa", () => {
    expect(casa("deal.won", {}, ev({ tipo: "deal.lost" }))).toBe(false);
    expect(casa("contact.created", {}, ev({ tipo: "contact.created", objeto: "deal" }))).toBe(false);
    expect(casa("deal.stale", {}, ev({}))).toBe(false); // varredura
  });

  it("perdido pelo motivo e funil", () => {
    expect(casa("deal.lost", { motivo: "preço" }, ev({ tipo: "deal.lost" }), { lost_reason: "Preco alto", pipeline_id: "p1" })).toBe(true);
    expect(casa("deal.lost", { funil: "p2" }, ev({ tipo: "deal.lost", dados: { pipeline_id: "p1" } }), { pipeline_id: "p1" })).toBe(false);
  });

  it("campo alterado: casa pelo diff, filtra o valor novo e ignora a própria automação", () => {
    const e = ev({ tipo: "deal.updated", diff: { amount_cents: { de: 1, para: 500 } } });
    expect(casa("deal.field_changed", { campo: "registro.amount_cents" }, e)).toBe(true);
    expect(casa("deal.field_changed", { campo: "registro.amount_cents", para: "500" }, e)).toBe(true);
    expect(casa("deal.field_changed", { campo: "registro.amount_cents", para: "9" }, e)).toBe(false);
    expect(casa("deal.field_changed", { campo: "registro.name" }, e)).toBe(false);
    expect(casa("deal.field_changed", { campo: "registro.amount_cents" }, { ...e, ator: { tipo: "automacao", automacaoId: "a1" } })).toBe(false);
    expect(casa("deal.field_changed", { campo: "registro.amount_cents" }, { ...e, ator: { tipo: "automacao", automacaoId: "outra" } })).toBe(true);
  });

  it("mensagem recebida: primeira, palavra e canal", () => {
    const m = (dados: Record<string, unknown>) => ev({ tipo: "message.received", objeto: "conversation", dados });
    expect(casa("message.received", { modo: "primeira" }, m({ primeira: true }))).toBe(true);
    expect(casa("message.received", { modo: "primeira" }, m({ primeira: false }))).toBe(false);
    expect(casa("message.received", { modo: "contem", palavras: "orçamento, preço" }, m({ text: "Qual o PRECO?" }))).toBe(true);
    expect(casa("message.received", { modo: "contem", palavras: "preço" }, m({ text: "apreçar" }))).toBe(false);
    expect(casa("message.received", { modo: "qualquer", canal: "instagram" }, m({ channel: "whatsapp_qr" }))).toBe(false);
    expect(palavrasDoTexto("quero um orçamento agora", "orcamento")).toBe(true);
  });

  it("etiqueta e tipo da tarefa", () => {
    expect(casa("contact.tag_added", { tag: "t1" }, ev({ tipo: "contact.tag_added", objeto: "contact", dados: { tag_id: "t1" } }))).toBe(true);
    expect(casa("task.completed", { tipo_tarefa: "ligar" }, ev({ tipo: "task.completed", objeto: "task" }), { type: "ligar" })).toBe(true);
  });

  it("alvos do evento: conversa → contato; tarefa → negócio e contato", () => {
    expect(alvosDoEvento(ev({ tipo: "message.received", objeto: "conversation", objetoId: "cv1", dados: { contact_id: "c1" } }))).toEqual([
      { objeto: "conversation", id: "cv1" },
      { objeto: "contact", id: "c1" },
    ]);
    expect(alvosDoEvento(ev({ tipo: "task.completed", objeto: "task", objetoId: "t1" }), { deal_id: "d1", contact_id: "c1" })).toHaveLength(3);
  });
});

describe("interpretador", () => {
  const agora = sp("2026-10-21T10:00:00");
  const ctx = { registro: { stage_id: "s_prop", renovacao: "2026-11-10" }, contato: {} };

  it("condição e caminho", () => {
    const d = exemploProposta();
    expect(decidir(d, "cond", ctx, agora)).toEqual({ tipo: "seguir", para: "zap", saida: "sim" });
    expect(decidir(d, "cond", { registro: { stage_id: "x" } }, agora)).toEqual({ tipo: "seguir", para: "nota", saida: "nao" });
    expect(decidir(d, "zap", ctx, agora)).toMatchObject({ tipo: "acao" });
    expect(decidir(d, null, ctx, agora)).toEqual({ tipo: "fim" });
    expect(decidir(d, "sumiu", ctx, agora)).toMatchObject({ tipo: "erro" });
  });

  it("espera: calcula, aguarda e libera quando vence", () => {
    const d = exemploProposta();
    const m = decidir(d, "espera", ctx, agora);
    expect(m).toMatchObject({ tipo: "esperar", espera: { noId: "espera" } });
    const ate = (m as { ate: Date }).ate;
    expect(ate.toISOString()).toBe(sp("2026-10-23T10:00:00").toISOString());
    const estado = { noId: "espera", ate: ate.toISOString() };
    expect(decidir(d, "espera", ctx, sp("2026-10-22T10:00:00"), estado)).toMatchObject({ tipo: "esperar" });
    expect(decidir(d, "espera", ctx, sp("2026-10-23T10:00:00"), estado)).toMatchObject({ tipo: "seguir", para: "cond" });
  });

  it("espera relativa a campo: 3 dias antes às 09:00; campo vazio segue em frente", () => {
    expect(fimDaEspera({ modo: "relativa_campo", campo: "registro.renovacao", dias: -3 }, ctx, agora)?.toISOString()).toBe(sp("2026-11-07T09:00:00").toISOString());
    const d: Definicao = { ...exemploProposta() };
    d.nos.espera = { id: "espera", tipo: "espera", config: { modo: "relativa_campo", campo: "registro.nada", dias: 0 }, proximo: "cond" };
    expect(decidir(d, "espera", ctx, agora)).toMatchObject({ tipo: "seguir", para: "cond", detalhe: { pulou: "campo de data vazio" } });
  });

  it("esperar evento: registra; acontece ou esgota", () => {
    const d: Definicao = { ...exemploProposta() };
    d.nos.espera = { id: "espera", tipo: "esperar_evento", evento: "message.received", prazo: { quantidade: 1, unidade: "dias" }, aconteceu: "cond", esgotou: "nota" } as No;
    const m = decidir(d, "espera", ctx, agora);
    expect(m).toMatchObject({ tipo: "esperar", registrar: { evento: "message.received" } });
    const ate = (m as { espera: { ate: string } }).espera.ate;
    expect(decidir(d, "espera", ctx, agora, { noId: "espera", ate, resultado: "aconteceu" })).toMatchObject({ saida: "aconteceu", para: "cond" });
    expect(decidir(d, "espera", ctx, sp("2026-10-22T10:00:00"), { noId: "espera", ate })).toMatchObject({ saida: "esgotou", para: "nota" });
  });

  it("caminhos: primeiro que bate; senão o caso contrário", () => {
    const d: Definicao = { ...exemploProposta() };
    d.nos.cond = {
      id: "cond",
      tipo: "caminhos",
      caminhos: [
        { id: "c1", nome: "Grande", regra: { grupos: [{ condicoes: [{ campo: "registro.valor", operador: "maior", valor: 1000 }] }] }, proximo: "zap" },
        { id: "c2", nome: "Pequeno", regra: { grupos: [{ condicoes: [{ campo: "registro.valor", operador: "menor", valor: 1000 }] }] }, proximo: "nota" },
      ],
      senao: null,
    } as No;
    expect(decidir(d, "cond", { registro: { valor: 5000 } }, agora)).toMatchObject({ saida: "caminho:c1", para: "zap" });
    expect(decidir(d, "cond", { registro: { valor: 10 } }, agora)).toMatchObject({ saida: "caminho:c2", para: "nota" });
    expect(decidir(d, "cond", { registro: {} }, agora)).toMatchObject({ saida: "senao", para: null });
  });
});
