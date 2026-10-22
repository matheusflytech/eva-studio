import { describe, expect, it } from "vitest";
import { formatarSaoPaulo } from "@/lib/fuso-sp";
import { interpretarQuickAdd } from "./quick-add";

// Terça, 20/10/2026, 10:00 em São Paulo (13:00 UTC).
const AGORA = new Date("2026-10-20T13:00:00Z");
const q = (t: string, agora = AGORA) => interpretarQuickAdd(t, agora);
const quando = (t: string, agora = AGORA) => {
  const r = q(t, agora);
  return r.dueAt ? formatarSaoPaulo(r.dueAt) : null;
};

describe("quick add pt-BR", () => {
  it("ligar João amanhã 14h", () => {
    const r = q("ligar João amanhã 14h");
    expect(r.tipo).toBe("ligar");
    expect(r.pessoa).toBe("João");
    expect(r.titulo).toBe("Ligar João");
    expect(r.diaTodo).toBe(false);
    expect(formatarSaoPaulo(r.dueAt!)).toBe("21/10/2026 às 14:00");
  });

  it("whatsapp para Maria sexta → dia todo na próxima sexta", () => {
    const r = q("whatsapp para Maria sexta");
    expect(r.tipo).toBe("whatsapp");
    expect(r.pessoa).toBe("Maria");
    expect(r.titulo).toBe("Whatsapp para Maria");
    expect(r.diaTodo).toBe(true);
    expect(formatarSaoPaulo(r.dueAt!)).toBe("23/10/2026 às 23:59");
  });

  it("datas relativas", () => {
    expect(quando("ligar hoje 16h")).toBe("20/10/2026 às 16:00");
    expect(quando("ligar depois de amanhã às 9")).toBe("22/10/2026 às 09:00");
    expect(quando("email em 3 dias")).toBe("23/10/2026 às 23:59");
    expect(quando("ligar daqui a 2 horas")).toBe("20/10/2026 às 12:00");
    expect(quando("ligar em 30 min")).toBe("20/10/2026 às 10:30");
    expect(quando("visita semana que vem")).toBe("26/10/2026 às 23:59");
    expect(quando("visita na próxima semana")).toBe("26/10/2026 às 23:59");
  });

  it("dias da semana: sempre a próxima ocorrência", () => {
    expect(quando("reunião segunda 10h")).toBe("26/10/2026 às 10:00");
    expect(quando("reunião na segunda-feira")).toBe("26/10/2026 às 23:59");
    // terça dita na terça = a da semana que vem
    expect(quando("ligar terça")).toBe("27/10/2026 às 23:59");
    expect(quando("ligar na qui")).toBe("22/10/2026 às 23:59");
    expect(quando("sábado visita")).toBe("24/10/2026 às 23:59");
    // "ter" sozinho é verbo, não terça
    expect(q("ter reunião com Ana").dueAt).toBeNull();
  });

  it("datas absolutas", () => {
    expect(quando("visita Acme 25/10 às 9h30")).toBe("25/10/2026 às 09:30");
    expect(quando("ligar 05/01")).toBe("05/01/2027 às 23:59");
    expect(quando("ligar 05/01/2026")).toBe("05/01/2026 às 23:59");
    expect(quando("ligar dia 25")).toBe("25/10/2026 às 23:59");
    expect(quando("ligar dia 5")).toBe("05/11/2026 às 23:59");
  });

  it("horas", () => {
    expect(quando("ligar amanhã 14:30")).toBe("21/10/2026 às 14:30");
    expect(quando("ligar amanhã 9h")).toBe("21/10/2026 às 09:00");
    expect(quando("ligar amanhã meio-dia")).toBe("21/10/2026 às 12:00");
    expect(quando("ligar amanhã 3 da tarde")).toBe("21/10/2026 às 15:00");
    expect(quando("ligar amanhã às 3")).toBe("21/10/2026 às 15:00");
    expect(quando("ligar amanhã 8 da manhã")).toBe("21/10/2026 às 08:00");
  });

  it("só hora: hoje se ainda não passou, senão amanhã", () => {
    expect(quando("ligar 14h")).toBe("20/10/2026 às 14:00");
    expect(quando("ligar 9h")).toBe("21/10/2026 às 09:00");
  });

  it("fuso: 23h em SP já é outro dia em UTC", () => {
    // 22:30 em SP de terça = 01:30 UTC de quarta
    const tarde = new Date("2026-10-21T01:30:00Z");
    expect(quando("ligar amanhã 9h", tarde)).toBe("21/10/2026 às 09:00");
    expect(quando("ligar hoje 23h", tarde)).toBe("20/10/2026 às 23:00");
  });

  it("prioridade e sem data", () => {
    const r = q("Enviar proposta Acme urgente");
    expect(r.prioridade).toBe("alta");
    expect(r.tipo).toBe("afazer");
    expect(r.tipoReconhecido).toBe(false);
    expect(r.dueAt).toBeNull();
    expect(r.titulo).toBe("Enviar proposta Acme");
    expect(q("ligar Ana ! amanhã").prioridade).toBe("alta");
  });

  it("nome composto e minúsculas", () => {
    expect(q("ligar para Maria da Silva amanhã 10h").pessoa).toBe("Maria da Silva");
    expect(q("ligar para o cliente amanhã").pessoa).toBeNull();
    expect(q("").titulo).toBe("");
  });
});
