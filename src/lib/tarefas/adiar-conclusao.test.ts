import { describe, expect, it } from "vitest";
import { formatarSaoPaulo } from "@/lib/fuso-sp";
import { calcularAdiamento, empurrarPrevisao } from "./adiar";
import { somarDiasUteis, sugerirProximoPasso, textoDoResultado, validarConclusao } from "./conclusao";

// Terça, 20/10/2026, 10:00 em SP.
const AGORA = new Date("2026-10-20T13:00:00Z");

describe("adiar", () => {
  it("+1h, amanhã 9h, próxima segunda 9h, data escolhida", () => {
    expect(formatarSaoPaulo(calcularAdiamento("1h", AGORA)!.dueAt)).toBe("20/10/2026 às 11:00");
    expect(formatarSaoPaulo(calcularAdiamento("amanha", AGORA)!.dueAt)).toBe("21/10/2026 às 09:00");
    expect(formatarSaoPaulo(calcularAdiamento("segunda", AGORA)!.dueAt)).toBe("26/10/2026 às 09:00");
    const d = new Date("2026-11-03T15:00:00Z");
    expect(calcularAdiamento("data", AGORA, { dueAt: d, diaTodo: true })).toEqual({ dueAt: d, diaTodo: true });
    expect(calcularAdiamento("data", AGORA, null)).toBeNull();
    expect(calcularAdiamento("data", AGORA, { dueAt: new Date("x") })).toBeNull();
  });

  it("empurra a previsão pelos mesmos dias", () => {
    const previsao = new Date("2026-10-30T12:00:00Z");
    const antes = new Date("2026-10-20T13:00:00Z");
    const depois = new Date("2026-10-26T12:00:00Z"); // +6 dias
    expect(empurrarPrevisao(previsao, antes, depois, AGORA)?.toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("sem previsão não mexe; +1h no mesmo dia não anda", () => {
    expect(empurrarPrevisao(null, null, new Date(), AGORA)).toBeNull();
    const previsao = new Date("2026-10-30T12:00:00Z");
    expect(empurrarPrevisao(previsao, AGORA, new Date("2026-10-20T14:00:00Z"), AGORA)?.toISOString()).toBe(previsao.toISOString());
  });

  it("previsão nunca fica antes do novo prazo", () => {
    const previsao = new Date("2026-10-21T00:00:00Z"); // 21/10
    const depois = new Date("2026-11-10T12:00:00Z");
    // tarefa sem prazo anterior: conta de hoje (20/10) → 21 dias → 11/11
    expect(empurrarPrevisao(previsao, null, depois, AGORA)?.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    // previsão já vencida, adiamento curto: sobe até o dia do prazo
    const vencida = new Date("2026-10-01T00:00:00Z");
    expect(empurrarPrevisao(vencida, AGORA, new Date("2026-10-21T12:00:00Z"), AGORA)?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
});

describe("conclusão exige decisão de próximo passo", () => {
  it("sem resultado → erro", () => {
    const r = validarConclusao({ proximo: { decisao: "sem_proximo" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("resultado_obrigatorio");
  });

  it("sem decisão → proximo_passo_obrigatorio", () => {
    for (const corpo of [{ resultado: "falou" }, { resultado: "falou", proximo: {} }, { resultado: "falou", proximo: { decisao: "talvez" } }]) {
      const r = validarConclusao(corpo);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.codigo).toBe("proximo_passo_obrigatorio");
    }
    expect(validarConclusao(null).ok).toBe(false);
  });

  it("sem próximo passo é uma escolha válida", () => {
    const r = validarConclusao({ resultado: "nao_atendeu", nota: "  caixa postal ", proximo: { decisao: "sem_proximo" } });
    expect(r).toEqual({ ok: true, pedido: { resultado: "nao_atendeu", nota: "caixa postal", proximo: { decisao: "sem_proximo" } } });
  });

  it("agendar exige tipo, texto e data; aceita hora de SP sem fuso e tipo antigo", () => {
    const ruim = validarConclusao({ resultado: "falou", proximo: { decisao: "agendou", tipo: "ligar", texto: "", dueAt: "2026-10-22T10:00" } });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(ruim.codigo).toBe("proxima_atividade_invalida");
    const ok = validarConclusao({ resultado: "falou", proximo: { decisao: "agendou", tipo: "outro", texto: "Mandar proposta", dueAt: "2026-10-22T10:00" } });
    expect(ok.ok).toBe(true);
    if (ok.ok && ok.pedido.proximo.decisao === "agendou") {
      expect(ok.pedido.proximo.tarefa.tipo).toBe("afazer");
      expect(formatarSaoPaulo(ok.pedido.proximo.tarefa.dueAt)).toBe("22/10/2026 às 10:00");
    }
  });

  it("sugestão já preenchida", () => {
    const naoAtendeu = sugerirProximoPasso({ tipo: "ligar", texto: "Ligar João" }, "nao_atendeu", AGORA);
    expect(naoAtendeu.tipo).toBe("whatsapp");
    expect(naoAtendeu.texto).toBe("Tentar de novo: Ligar João");
    expect(formatarSaoPaulo(naoAtendeu.dueAt)).toBe("21/10/2026 às 10:00");
    const remarcou = sugerirProximoPasso({ tipo: "reuniao", texto: "Demo" }, "remarcou", AGORA);
    expect(remarcou.tipo).toBe("reuniao");
    expect(formatarSaoPaulo(remarcou.dueAt)).toBe("22/10/2026 às 10:00");
    const falou = sugerirProximoPasso({ tipo: "ligar", texto: "Ligar João" }, "falou", AGORA);
    expect(falou.tipo).toBe("whatsapp");
    expect(falou.texto).toBe("Retorno: Ligar João");
  });

  it("dias úteis pulam o fim de semana", () => {
    const sexta = { ano: 2026, mes: 10, dia: 23 };
    expect(somarDiasUteis(sexta, 1)).toEqual({ ano: 2026, mes: 10, dia: 26 });
  });

  it("texto da timeline", () => {
    expect(textoDoResultado("ligar", "nao_atendeu", "caixa postal")).toBe("Ligação · Não atendeu — caixa postal");
    expect(textoDoResultado("outro", "falou", "")).toBe("A fazer · Falou");
    expect(textoDoResultado("email", null)).toBe("E-mail");
  });
});

describe("prazo da tela", () => {
  it("ISO, hora de SP e dia todo", async () => {
    const { lerPrazoDaTela } = await import("./conclusao");
    expect(lerPrazoDaTela(undefined)).toBeUndefined();
    expect(lerPrazoDaTela("")).toEqual({ dueAt: null, diaTodo: false });
    expect(lerPrazoDaTela("ontem")).toBe("invalida");
    expect(lerPrazoDaTela("2026-13-01")).toBe("invalida");
    expect(lerPrazoDaTela(5)).toBe("invalida");
    const dia = lerPrazoDaTela("2026-10-22");
    expect(dia !== "invalida" && dia && formatarSaoPaulo(dia.dueAt!)).toBe("22/10/2026 às 23:59");
    expect(dia !== "invalida" && dia?.diaTodo).toBe(true);
    const sp = lerPrazoDaTela("2026-10-22T14:00");
    expect(sp !== "invalida" && sp && formatarSaoPaulo(sp.dueAt!)).toBe("22/10/2026 às 14:00");
    const iso = lerPrazoDaTela("2026-10-20T17:00:00.000Z");
    expect(iso !== "invalida" && iso?.dueAt?.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
});
