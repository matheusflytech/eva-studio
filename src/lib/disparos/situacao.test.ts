import { describe, expect, it } from "vitest";
import { inicioDoDiaEmBrasilia, numeroDoDestino, paraCsv, situacaoDoItem } from "./situacao";

describe("situacaoDoItem", () => {
  it("lê a fila", () => {
    expect(situacaoDoItem({ status: "pending" })).toBe("fila");
    expect(situacaoDoItem({ status: "sending" })).toBe("enviando");
    expect(situacaoDoItem({ status: "failed", readAt: new Date() })).toBe("falhou");
    expect(situacaoDoItem({ status: "sent" })).toBe("enviado");
    expect(situacaoDoItem({ status: "sent", deliveredAt: new Date() })).toBe("entregue");
    expect(situacaoDoItem({ status: "sent", deliveredAt: new Date(), readAt: new Date() })).toBe("lido");
  });
});

describe("numeroDoDestino", () => {
  it("tira o servidor do contato, mantém grupo", () => {
    expect(numeroDoDestino("5511999990001@s.whatsapp.net")).toBe("5511999990001");
    expect(numeroDoDestino("1203@g.us")).toBe("1203@g.us");
  });
});

describe("inicioDoDiaEmBrasilia", () => {
  it("02:00 UTC ainda é o dia anterior em Brasília", () => {
    expect(inicioDoDiaEmBrasilia(new Date("2026-11-13T02:00:00Z")).toISOString()).toBe("2026-11-12T03:00:00.000Z");
    expect(inicioDoDiaEmBrasilia(new Date("2026-11-13T15:00:00Z")).toISOString()).toBe("2026-11-13T03:00:00.000Z");
  });
});

describe("paraCsv", () => {
  it("separa por ponto e vírgula, escapa aspas e neutraliza fórmula", () => {
    const csv = paraCsv(["a", "b"], [["x;y", '=SOMA(1)'], ['di"z', null]]);
    expect(csv).toBe('﻿a;b\r\n"x;y";\'=SOMA(1)\r\n"di""z";\r\n');
  });
});
