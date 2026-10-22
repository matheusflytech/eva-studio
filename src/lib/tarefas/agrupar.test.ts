import { describe, expect, it } from "vitest";
import { agruparTarefas, ehDiaTodo, grupoDaTarefa, tarefaEstaAtrasada } from "./agrupar";

// Terça, 20/10/2026, 10:00 em SP.
const AGORA = new Date("2026-10-20T13:00:00Z");
const t = (dueAt: string | null, extra: Partial<{ doneAt: string | null; diaTodo: boolean }> = {}) => ({ dueAt, doneAt: null, ...extra });

describe("agrupamento por data", () => {
  it("cada grupo", () => {
    expect(grupoDaTarefa(t("2026-10-20T12:00:00Z"), AGORA)).toBe("atrasadas"); // 9h de hoje
    expect(grupoDaTarefa(t("2026-10-19T15:00:00Z"), AGORA)).toBe("atrasadas");
    expect(grupoDaTarefa(t("2026-10-20T20:00:00Z"), AGORA)).toBe("hoje"); // 17h
    expect(grupoDaTarefa(t("2026-10-21T02:00:00Z"), AGORA)).toBe("hoje"); // 23h de SP, ainda hoje
    expect(grupoDaTarefa(t("2026-10-21T15:00:00Z"), AGORA)).toBe("amanha");
    expect(grupoDaTarefa(t("2026-10-25T15:00:00Z"), AGORA)).toBe("semana"); // domingo
    expect(grupoDaTarefa(t("2026-10-26T15:00:00Z"), AGORA)).toBe("depois"); // segunda que vem
    expect(grupoDaTarefa(t(null), AGORA)).toBe("sem_data");
    expect(grupoDaTarefa(t("2026-10-19T15:00:00Z", { doneAt: "2026-10-20T10:00:00Z" }), AGORA)).toBe("concluidas");
  });

  it("dia todo só atrasa quando o dia acaba", () => {
    // 23:59 de SP de hoje
    const hoje = t("2026-10-21T02:59:00Z");
    expect(ehDiaTodo(hoje.dueAt)).toBe(true);
    expect(grupoDaTarefa(hoje, AGORA)).toBe("hoje");
    // dia todo explícito às 00:00 de hoje: não está atrasada
    expect(tarefaEstaAtrasada(t("2026-10-20T03:00:00Z", { diaTodo: true }), AGORA)).toBe(false);
    expect(tarefaEstaAtrasada(t("2026-10-20T03:00:00Z", { diaTodo: false }), AGORA)).toBe(true);
    expect(tarefaEstaAtrasada(t("2026-10-20T02:59:00Z"), AGORA)).toBe(true); // 23:59 de ontem
  });

  it("domingo: amanhã já é a semana que vem", () => {
    const domingo = new Date("2026-10-25T13:00:00Z");
    expect(grupoDaTarefa(t("2026-10-26T15:00:00Z"), domingo)).toBe("amanha");
    expect(grupoDaTarefa(t("2026-10-27T15:00:00Z"), domingo)).toBe("depois");
  });

  it("monta na ordem da tela e ordena dentro", () => {
    const grupos = agruparTarefas(
      [
        { id: "c", ...t("2026-10-21T15:00:00Z") },
        { id: "a2", ...t("2026-10-19T15:00:00Z") },
        { id: "a1", ...t("2026-10-18T15:00:00Z") },
        { id: "f1", ...t(null, { doneAt: "2026-10-19T10:00:00Z" }) },
        { id: "f2", ...t(null, { doneAt: "2026-10-20T10:00:00Z" }) },
        { id: "s", ...t(null) },
      ],
      AGORA
    );
    expect(grupos.map((g) => g.grupo)).toEqual(["atrasadas", "amanha", "sem_data", "concluidas"]);
    expect(grupos[0].itens.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(grupos[3].itens.map((i) => i.id)).toEqual(["f2", "f1"]);
    expect(grupos[1].rotulo).toBe("Amanhã");
  });
});

describe("texto do prazo", () => {
  it("relativo, em SP, 24h", async () => {
    const { textoDoPrazo, textoDeMinutos } = await import("./formato");
    expect(textoDoPrazo("2026-10-20T17:00:00Z", false, AGORA)).toBe("Hoje 14:00");
    expect(textoDoPrazo("2026-10-21T02:59:00Z", null, AGORA)).toBe("Hoje");
    expect(textoDoPrazo("2026-10-21T12:00:00Z", false, AGORA)).toBe("Amanhã 09:00");
    expect(textoDoPrazo("2026-10-19T12:00:00Z", false, AGORA)).toBe("Ontem 09:00");
    expect(textoDoPrazo("2026-10-23T12:00:00Z", false, AGORA)).toBe("sex 23/10 09:00");
    expect(textoDoPrazo("2026-12-01T12:00:00Z", true, AGORA)).toBe("01/12");
    expect(textoDoPrazo("2027-01-05T12:00:00Z", true, AGORA)).toBe("05/01/2027");
    expect(textoDoPrazo(null, false, AGORA)).toBe("Sem data");
    expect(textoDeMinutos(45)).toBe("45 min");
    expect(textoDeMinutos(90)).toBe("1h30");
    expect(textoDeMinutos(120)).toBe("2h");
  });
});
