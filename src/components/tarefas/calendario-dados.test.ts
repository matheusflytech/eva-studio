import { describe, expect, it } from "vitest";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { diaEmSP as diaEmSPDe } from "@/lib/tarefas/calendario";
import {
  agruparPorDia,
  chaveDoDia,
  compararMeses,
  densidade,
  eventosDaAgenda,
  eventosDasTarefas,
  eventosDosNegocios,
  horaDoEvento,
  intervaloDaGrade,
  partesDoResumo,
  resumirDia,
  semanasDoMes,
  somarMeses,
  textoDoResumo,
  tituloDoDia,
} from "./calendario-dados";

function tarefa(p: Partial<TarefaDaTela>): TarefaDaTela {
  return {
    id: "t1",
    type: "ligar",
    text: "Ligar",
    dueAt: null,
    doneAt: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    diaTodo: false,
    prioridade: "normal",
    origem: "manual",
    duracaoMin: 15,
    resultado: null,
    nota: null,
    decisao: null,
    adiada: 0,
    overdue: false,
    contact: null,
    conversaId: null,
    deal: null,
    assignedTo: null,
    ...p,
  };
}

describe("semanasDoMes", () => {
  it("outubro de 2026 começa na quinta e ocupa 5 semanas de domingo a sábado", () => {
    const s = semanasDoMes({ ano: 2026, mes: 10 });
    expect(s).toHaveLength(5);
    expect(s[0][0]).toEqual({ ano: 2026, mes: 9, dia: 27 });
    expect(s[0][4]).toEqual({ ano: 2026, mes: 10, dia: 1 });
    expect(s[4][6]).toEqual({ ano: 2026, mes: 10, dia: 31 });
  });

  it("fevereiro de 2026 (começa no domingo, 28 dias) cabe em 4 semanas", () => {
    const s = semanasDoMes({ ano: 2026, mes: 2 });
    expect(s).toHaveLength(4);
    expect(s[0][0]).toEqual({ ano: 2026, mes: 2, dia: 1 });
  });

  it("agosto de 2026 precisa de 6 semanas", () => {
    expect(semanasDoMes({ ano: 2026, mes: 8 })).toHaveLength(6);
  });
});

describe("meses", () => {
  it("soma atravessando o ano", () => {
    expect(somarMeses({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(somarMeses({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(somarMeses({ ano: 2026, mes: 10 }, -12)).toEqual({ ano: 2025, mes: 10 });
  });

  it("compara para a direção da animação", () => {
    expect(compararMeses({ ano: 2026, mes: 10 }, { ano: 2026, mes: 11 })).toBe(1);
    expect(compararMeses({ ano: 2026, mes: 10 }, { ano: 2025, mes: 12 })).toBe(-1);
    expect(compararMeses({ ano: 2026, mes: 10 }, { ano: 2026, mes: 10 })).toBe(0);
  });
});

describe("eventos das tarefas", () => {
  const agora = new Date("2026-10-22T15:00:00.000Z"); // 12:00 em SP

  it("tarefa sem prazo fica fora; com prazo vira evento no dia de SP", () => {
    const ev = eventosDasTarefas(
      [tarefa({ id: "a" }), tarefa({ id: "b", dueAt: "2026-10-23T01:30:00.000Z" })], // 22h30 do dia 22 em SP
      agora
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].origem).toBe("tarefa");
    expect(horaDoEvento(ev[0])).toBe("22:30");
    expect([...agruparPorDia(ev).keys()]).toEqual(["2026-10-22"]);
    expect(ev[0].fim?.getTime()).toBe(new Date("2026-10-23T01:45:00.000Z").getTime());
  });

  it("ordena dia todo primeiro, depois a hora, feitas no fim, e resume o dia", () => {
    const ev = eventosDasTarefas(
      [
        tarefa({ id: "tarde", dueAt: "2026-10-22T18:00:00.000Z", type: "reuniao" }),
        tarefa({ id: "feita", dueAt: "2026-10-22T11:00:00.000Z", doneAt: "2026-10-22T11:10:00.000Z" }),
        tarefa({ id: "cedo", dueAt: "2026-10-22T12:00:00.000Z" }), // 09h SP, já passou
        tarefa({ id: "todo", dueAt: "2026-10-22T12:00:00.000Z", diaTodo: true }),
      ],
      agora
    );
    const dia = agruparPorDia(ev).get(chaveDoDia({ ano: 2026, mes: 10, dia: 22 }))!;
    expect(dia.map((e) => e.tarefa?.id)).toEqual(["todo", "cedo", "tarde", "feita"]);
    const r = resumirDia(dia);
    expect(r).toMatchObject({ tarefas: 3, atrasadas: 1, reunioes: 1, feitas: 1, total: 4 });
    expect(textoDoResumo(r)).toBe("3 tarefas · 1 reunião · 1 atrasada");
    expect(densidade(r)).toBe(2);
  });

  it("dia vazio", () => {
    const r = resumirDia([]);
    expect(textoDoResumo(r)).toBe("Nada marcado");
    expect(densidade(r)).toBe(0);
  });
});

it("título do dia em pt-BR", () => {
  expect(tituloDoDia({ ano: 2026, mes: 10, dia: 22 })).toBe("quinta-feira, 22 de outubro");
});

describe("intervalo da grade", () => {
  it("vai do domingo da primeira semana ao sábado da última (dias de SP)", () => {
    // Outubro de 2026: começa numa quinta (domingo antes = 27/09) e termina num sábado (31/10).
    expect(intervaloDaGrade({ ano: 2026, mes: 10 })).toEqual({ de: "2026-09-27", ate: "2026-10-31" });
    // Novembro de 2026: 01/11 é domingo; 30/11 é segunda (sábado depois = 05/12).
    expect(intervaloDaGrade({ ano: 2026, mes: 11 })).toEqual({ de: "2026-11-01", ate: "2026-12-05" });
  });
});

describe("fechamentos previstos", () => {
  const negocio = {
    id: "d1",
    name: "Plano anual",
    amountCents: 1_850_000,
    expectedClosingAt: "2026-10-30T12:00:00.000Z",
    stage: { name: "Proposta" },
    pipeline: { name: "Vendas" },
    company: { name: "Padaria Bom Pão" },
  };

  it("negócio com previsão vira evento de dia todo no dia de SP", () => {
    const [e] = eventosDosNegocios([negocio]);
    expect(e).toMatchObject({
      id: "negocio:d1",
      titulo: "Plano anual",
      origem: "negocio",
      diaTodo: true,
      feita: false,
      atrasada: false,
      tarefa: null,
      tipo: null,
      negocio: { id: "d1", valorCents: 1_850_000, etapa: "Proposta", funil: "Vendas", empresa: "Padaria Bom Pão" },
    });
    expect(chaveDoDia(diaEmSPDe(e.inicio))).toBe("2026-10-30");
  });

  it("sem previsão não entra", () => {
    expect(eventosDosNegocios([{ ...negocio, expectedClosingAt: null }])).toEqual([]);
  });

  it("entra no resumo do dia como fechamento, com o valor somado", () => {
    const eventos = eventosDosNegocios([negocio, { ...negocio, id: "d2", amountCents: 150_000 }]);
    const r = resumirDia(eventos);
    expect(r).toMatchObject({ fechamentos: 2, valorCents: 2_000_000, tarefas: 0, total: 2 });
    expect(partesDoResumo(r).map((p) => p.texto)).toEqual(["2 fechamentos"]);
    expect(densidade(r)).toBe(1);
  });

  it("dia todo vem antes das tarefas com hora", () => {
    const tarefaComHora = eventosDasTarefas([tarefa({ id: "t9", dueAt: "2026-10-30T13:00:00.000Z" })], new Date("2026-10-20T13:00:00Z"));
    const dia = agruparPorDia([...tarefaComHora, ...eventosDosNegocios([negocio])]).get("2026-10-30") ?? [];
    expect(dia.map((e) => e.origem)).toEqual(["negocio", "tarefa"]);
  });
});

describe("eventosDaAgenda", () => {
  it("evento do Google vira origem agenda, na cor da agenda, e conta como agenda no resumo", () => {
    const [e] = eventosDaAgenda([
      { key: "c:p:1", title: "Daily", start: "2026-10-30T12:00:00.000Z", end: "2026-10-30T12:30:00.000Z", allDay: false, link: null, meet: "https://meet.google.com/x", color: "violet", calendar: "Trabalho", owner: "Ana", mine: false },
    ]);
    expect(e).toMatchObject({ origem: "agenda", cor: "violet", diaTodo: false, tarefa: null, agenda: { reuniao: "https://meet.google.com/x", dono: "Ana", minha: false } });
    expect(resumirDia([e]).agenda).toBe(1);
  });
});
