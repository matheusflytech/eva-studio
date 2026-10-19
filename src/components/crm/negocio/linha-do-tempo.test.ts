import { describe, it, expect } from "vitest";
import {
  agruparPorDia,
  descreverItem,
  filtrarItens,
  horaEmSP,
  ordenarTarefas,
  rotuloDoDia,
  tempoNaEtapa,
  type ItemDaLinhaDoTempo,
} from "./linha-do-tempo";

// 19/out/2026 10h em São Paulo (13h UTC).
const AGORA = new Date("2026-10-19T13:00:00Z");

const nota = (id: string, em: string): ItemDaLinhaDoTempo => ({ id, tipo: "nota", em, texto: "x", autor: null });

describe("descreverItem", () => {
  it("mudança de etapa com origem", () => {
    expect(
      descreverItem({ id: "1", tipo: "etapa", em: "", de: "Proposta", para: "Negociação", paraTipo: "open", origem: "fluxo" })
    ).toEqual({ titulo: "Movido de Proposta para Negociação · pelo fluxo" });
  });

  it("movimento manual não ganha sufixo", () => {
    expect(
      descreverItem({ id: "1", tipo: "etapa", em: "", de: "A", para: "B", paraTipo: "open", origem: "usuario" }).titulo
    ).toBe("Movido de A para B");
  });

  it("ganho e perdido", () => {
    const base = { id: "1", tipo: "etapa" as const, em: "", de: "A", origem: "usuario" };
    expect(descreverItem({ ...base, para: "Fechado", paraTipo: "won" }).titulo).toBe("Marcado como ganho (Fechado)");
    expect(descreverItem({ ...base, para: "Perdido", paraTipo: "lost" }).titulo).toBe("Marcado como perdido (Perdido)");
  });

  it("criação, tarefa e conversa", () => {
    expect(descreverItem({ id: "1", tipo: "criado", em: "", etapa: null }).titulo).toBe("Negócio criado");
    expect(descreverItem({ id: "1", tipo: "criado", em: "", etapa: "Lead" }).titulo).toBe("Negócio criado em Lead");
    expect(
      descreverItem({ id: "1", tipo: "tarefa_concluida", em: "", tarefaId: "t", tipoTarefa: "ligar", texto: "Retornar", prazo: null })
    ).toEqual({ titulo: "Tarefa concluída: Ligar", detalhe: "Retornar" });
    expect(descreverItem({ id: "1", tipo: "conversa", em: "", conversaId: "c", canal: "whatsapp_qr", contato: "Bia" })).toEqual({
      titulo: "Nova conversa no WhatsApp",
      detalhe: "com Bia",
    });
    expect(descreverItem({ id: "1", tipo: "nota", em: "", texto: "oi", autor: "Ana" })).toEqual({ titulo: "Nota de Ana", detalhe: "oi" });
  });
});

describe("filtrarItens", () => {
  const itens: ItemDaLinhaDoTempo[] = [
    { id: "c", tipo: "criado", em: "2026-10-01T00:00:00.000Z", etapa: null },
    { id: "e", tipo: "etapa", em: "2026-10-02T00:00:00.000Z", de: null, para: "A", paraTipo: "open", origem: "usuario" },
    nota("n", "2026-10-03T00:00:00.000Z"),
    { id: "t", tipo: "tarefa_criada", em: "2026-10-04T00:00:00.000Z", tarefaId: "t", tipoTarefa: "ligar", texto: "", prazo: null },
  ];
  it("tudo devolve tudo; etapas inclui a criação", () => {
    expect(filtrarItens(itens, "tudo")).toHaveLength(4);
    expect(filtrarItens(itens, "etapas").map((i) => i.id)).toEqual(["c", "e"]);
    expect(filtrarItens(itens, "tarefas").map((i) => i.id)).toEqual(["t"]);
    expect(filtrarItens(itens, "conversas")).toEqual([]);
  });
});

describe("agruparPorDia (America/Sao_Paulo)", () => {
  it("23h30 de SP no dia 18 é 02h30 UTC do dia 19, e fica em Ontem", () => {
    const grupos = agruparPorDia(
      [nota("a", "2026-10-19T02:30:00.000Z"), nota("b", "2026-10-19T12:00:00.000Z"), nota("c", "2026-10-10T15:00:00.000Z")],
      AGORA
    );
    expect(grupos.map((g) => [g.rotulo, g.itens.map((i) => i.id)])).toEqual([
      ["Hoje", ["b"]],
      ["Ontem", ["a"]],
      ["10 de outubro", ["c"]],
    ]);
  });

  it("ordena do mais recente, mesmo vindo fora de ordem", () => {
    const grupos = agruparPorDia([nota("a", "2026-10-19T10:00:00.000Z"), nota("b", "2026-10-19T12:00:00.000Z")], AGORA);
    expect(grupos[0].itens.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("outro ano mostra o ano", () => {
    expect(rotuloDoDia("2025-12-31", AGORA)).toBe("31 de dezembro de 2025");
  });

  it("hora no relógio de SP", () => {
    expect(horaEmSP("2026-10-19T13:05:00.000Z")).toBe("10:05");
  });
});

describe("tempoNaEtapa", () => {
  it("dias inteiros desde a entrada", () => {
    expect(tempoNaEtapa("2026-10-19T08:00:00.000Z", AGORA)).toBe("desde hoje");
    expect(tempoNaEtapa("2026-10-18T08:00:00.000Z", AGORA)).toBe("há 1 dia");
    expect(tempoNaEtapa("2026-10-07T08:00:00.000Z", AGORA)).toBe("há 12 dias");
    // 18/out 23h46 em São Paulo: menos de 24h, mas já é "ontem" no calendário.
    expect(tempoNaEtapa("2026-10-19T02:46:00.000Z", AGORA)).toBe("há 1 dia");
  });
});

describe("ordenarTarefas", () => {
  it("abertas primeiro por prazo (sem prazo no fim), feitas depois da mais recente", () => {
    const t = (id: string, dueAt: string | null, doneAt: string | null) => ({ id, type: "ligar", text: id, dueAt, doneAt });
    const ordem = ordenarTarefas([
      t("feita-antiga", null, "2026-10-01T00:00:00.000Z"),
      t("sem-prazo", null, null),
      t("depois", "2026-10-25T00:00:00.000Z", null),
      t("feita-nova", null, "2026-10-10T00:00:00.000Z"),
      t("antes", "2026-10-20T00:00:00.000Z", null),
    ]).map((x) => x.id);
    expect(ordem).toEqual(["antes", "depois", "sem-prazo", "feita-nova", "feita-antiga"]);
  });
});
