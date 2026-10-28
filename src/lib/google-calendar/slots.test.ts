import { describe, it, expect } from "vitest";
import { deParedeSP } from "@/lib/fuso-sp";
import { categoryFromHex, freeSlots, whyNot } from "./slots";

const hours = { days: [1, 2, 3, 4, 5], start: "09:00", end: "12:00", durationMin: 60 };
// 2026-11-02 é segunda.
const monday = { ano: 2026, mes: 11, dia: 2 };
const at = (h: number, m = 0) => deParedeSP(2026, 11, 2, h, m);
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

describe("freeSlots", () => {
  it("de 30 em 30 dentro do horário, sem passar do fim e sem o ocupado", () => {
    const busy = [{ start: at(10), end: at(10, 30) }];
    const r = freeSlots(monday, hours, busy, at(6));
    expect(r.map(hhmm)).toEqual(["09:00", "10:30", "11:00"]);
  });

  it("respeita a antecedência mínima e o dia da semana", () => {
    expect(freeSlots(monday, hours, [], at(9, 30)).map(hhmm)).toEqual(["10:30", "11:00"]);
    expect(freeSlots({ ano: 2026, mes: 11, dia: 1 }, hours, [], at(6))).toEqual([]);
  });
});

describe("whyNot", () => {
  it("diz o motivo ou null", () => {
    expect(whyNot(at(9), hours, [], at(6))).toBeNull();
    expect(whyNot(at(11, 30), hours, [], at(6))).toBe("fora do horário de atendimento");
    expect(whyNot(at(9), hours, [{ start: at(9, 30), end: at(10) }], at(6))).toBe("horário ocupado");
    expect(whyNot(at(6, 30), hours, [], at(6))).toBe("horário no passado ou muito em cima");
  });
});

describe("categoryFromHex", () => {
  it("cores comuns do Google", () => {
    expect(categoryFromHex("#039be5")).toBe("cyan");
    expect(categoryFromHex("#d50000")).toBe("red");
    expect(categoryFromHex("#33b679")).toBe("green");
    expect(categoryFromHex("#616161")).toBe("slate");
    expect(categoryFromHex(null)).toBe("blue");
  });
});
