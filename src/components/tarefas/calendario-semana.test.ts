import { describe, expect, it } from "vitest";
import type { EventoDoCalendario } from "./calendario-dados";
import { antecedencia, blocosDoDia, diasDaSemana, eventoEmDestaque, intervaloDaVisao, minutosDeDuracao } from "./calendario-semana";

function evento(p: Partial<EventoDoCalendario> & { id: string; inicio: Date }): EventoDoCalendario {
  return {
    titulo: p.id,
    fim: null,
    diaTodo: false,
    origem: "tarefa",
    tipo: "reuniao",
    atrasada: false,
    feita: false,
    tarefa: null,
    ...p,
  };
}

// Horários de SP (UTC−3).
const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

describe("semana", () => {
  it("vai de segunda a domingo", () => {
    const dias = diasDaSemana({ ano: 2026, mes: 10, dia: 23 });
    expect(dias[0]).toEqual({ ano: 2026, mes: 10, dia: 19 });
    expect(dias[6]).toEqual({ ano: 2026, mes: 10, dia: 25 });
  });

  it("domingo fica no fim da semana dele", () => {
    expect(diasDaSemana({ ano: 2026, mes: 10, dia: 25 })[0]).toEqual({ ano: 2026, mes: 10, dia: 19 });
  });

  it("intervalo cobre a grade do mês e a semana, mesmo quando a semana passa do mês", () => {
    // 30/11/2026 é segunda: a semana vai até 06/12, depois da grade de novembro (05/12).
    expect(intervaloDaVisao({ ano: 2026, mes: 11, dia: 30 })).toEqual({ de: "2026-11-01", ate: "2026-12-06" });
    expect(intervaloDaVisao({ ano: 2026, mes: 10, dia: 23 })).toEqual({ de: "2026-09-27", ate: "2026-10-31" });
  });
});

describe("blocos do dia", () => {
  it("posiciona pelo minuto do dia de SP, com duração mínima de 45 min", () => {
    const [b] = blocosDoDia([evento({ id: "a", inicio: sp("2026-10-23", "09:30"), fim: sp("2026-10-23", "09:40") })]);
    expect(b).toMatchObject({ inicioMin: 570, fimMin: 615, coluna: 0, colunas: 1 });
  });

  it("dia todo fica fora da grade de horas", () => {
    expect(blocosDoDia([evento({ id: "a", inicio: sp("2026-10-23", "12:00"), diaTodo: true })])).toEqual([]);
  });

  it("eventos que se cruzam dividem a largura; o que vem depois reaproveita a coluna livre", () => {
    const blocos = blocosDoDia([
      evento({ id: "a", inicio: sp("2026-10-23", "10:00"), fim: sp("2026-10-23", "11:00") }),
      evento({ id: "b", inicio: sp("2026-10-23", "10:30"), fim: sp("2026-10-23", "11:30") }),
      evento({ id: "c", inicio: sp("2026-10-23", "11:00"), fim: sp("2026-10-23", "12:00") }),
      evento({ id: "d", inicio: sp("2026-10-23", "14:00"), fim: sp("2026-10-23", "15:00") }),
    ]);
    const por = Object.fromEntries(blocos.map((b) => [b.evento.id, [b.coluna, b.colunas]]));
    expect(por).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it("evento que passa da meia-noite para no fim do dia", () => {
    const [b] = blocosDoDia([evento({ id: "a", inicio: sp("2026-10-23", "23:30"), fim: sp("2026-10-24", "01:00") })]);
    expect(b.fimMin).toBe(1440);
  });
});

describe("antecedência e destaque", () => {
  const agora = sp("2026-10-23", "13:20");

  it("textos de quando", () => {
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-23", "13:30") }), agora)).toEqual({ texto: "em 10 min", tom: "aviso" });
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-23", "16:20") }), agora)).toEqual({ texto: "em 3 h", tom: "normal" });
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-23", "13:00"), fim: sp("2026-10-23", "14:00") }), agora)).toEqual({ texto: "agora", tom: "aviso" });
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-22", "10:00"), atrasada: true }), agora)).toEqual({ texto: "atrasada", tom: "perigo" });
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-22", "10:00"), feita: true }), agora)).toEqual({ texto: "feita", tom: "normal" });
    expect(antecedencia(evento({ id: "a", inicio: sp("2026-10-30", "12:00"), diaTodo: true, origem: "negocio" }), agora)).toBeNull();
  });

  it("destaque é o próximo em aberto que ainda não acabou; senão o primeiro", () => {
    const eventos = [
      evento({ id: "passou", inicio: sp("2026-10-23", "09:00"), fim: sp("2026-10-23", "09:30") }),
      evento({ id: "feita", inicio: sp("2026-10-23", "14:00"), feita: true }),
      evento({ id: "proxima", inicio: sp("2026-10-23", "15:00") }),
    ];
    expect(eventoEmDestaque(eventos, agora)?.id).toBe("proxima");
    expect(eventoEmDestaque([eventos[0]], agora)?.id).toBe("passou");
    expect(eventoEmDestaque([], agora)).toBeNull();
  });

  it("duração em minutos (sem fim: null)", () => {
    expect(minutosDeDuracao(evento({ id: "a", inicio: sp("2026-10-23", "13:30"), fim: sp("2026-10-23", "14:30") }))).toBe(60);
    expect(minutosDeDuracao(evento({ id: "a", inicio: sp("2026-10-23", "13:30") }))).toBeNull();
  });
});
