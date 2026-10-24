import { describe, expect, it } from "vitest";
import { emBaloes, paraWhatsApp, pausaDeDigitacao } from "./formato-whatsapp";

describe("paraWhatsApp", () => {
  it("negrito, itálico, riscado", () => {
    expect(paraWhatsApp("Isto é **importante**, __muito__, *leve* e ~~velho~~.")).toBe(
      "Isto é *importante*, *muito*, _leve_ e ~velho~."
    );
  });

  it("título vira negrito sem negrito dentro (resposta real de 24/10)", () => {
    expect(paraWhatsApp("### Modelo de **Outsourcing** da Eva Holding\n\nNa Eva...")).toBe(
      "*Modelo de Outsourcing da Eva Holding*\n\nNa Eva..."
    );
  });

  it("tabela de 2 colunas vira lista (resposta real de 23/10)", () => {
    const md = [
      "A Eva Holding oferece quatro frentes:",
      "",
      "| Frente | O que entregamos |",
      "|---|---|",
      "| **Agentes de IA** | Atendimento 24 h em texto ou áudio. |",
      "| **Automação** | Integração entre ERP e CRM. |",
    ].join("\n");
    expect(paraWhatsApp(md)).toBe(
      "A Eva Holding oferece quatro frentes:\n\n• *Agentes de IA*: Atendimento 24 h em texto ou áudio.\n• *Automação*: Integração entre ERP e CRM."
    );
  });

  it("tabela de 3 colunas leva o título de cada coluna", () => {
    const md = "| Plano | Preço | Prazo |\n|:--|--:|---|\n| Básico | R$ 100 | 7 dias |";
    expect(paraWhatsApp(md)).toBe("• *Básico*: Preço: R$ 100 · Prazo: 7 dias");
  });

  it("links, listas e linha horizontal", () => {
    expect(paraWhatsApp("Veja [o site](https://eva.com) e https://x.com\n\n---\n- um\n* dois\n1. três")).toBe(
      "Veja o site: https://eva.com e https://x.com\n\n• um\n• dois\n1. três"
    );
    expect(paraWhatsApp("[https://eva.com](https://eva.com)")).toBe("https://eva.com");
  });

  it("não mexe em código nem em conta", () => {
    expect(paraWhatsApp("```\n# não é título\n**x**\n```")).toBe("```\n# não é título\n**x**\n```");
    expect(paraWhatsApp("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(paraWhatsApp("arquivo_do_cliente_novo.pdf")).toBe("arquivo_do_cliente_novo.pdf");
  });

  it("texto normal passa igual", () => {
    const t = "Olá! Como posso ajudar você hoje? 🚀\n\nEstou à disposição.";
    expect(paraWhatsApp(t)).toBe(t);
  });
});

describe("emBaloes", () => {
  it("resposta curta fica num balão", () => {
    expect(emBaloes("Olá!\n\nComo posso ajudar?")).toEqual(["Olá!\n\nComo posso ajudar?"]);
  });

  it("até 3 parágrafos: um por balão", () => {
    const p = "x".repeat(80);
    expect(emBaloes(`${p}\n\n${p}`)).toEqual([p, p]);
  });

  it("mais parágrafos: nunca passa de 3 balões e não perde texto", () => {
    const ps = ["a", "b", "c", "d", "e", "f", "g"].map((l) => l.repeat(60));
    const baloes = emBaloes(ps.join("\n\n"));
    expect(baloes).toHaveLength(3);
    expect(baloes.join("\n\n")).toBe(ps.join("\n\n"));
  });

  it("não corta bloco de código", () => {
    const t = `${"x".repeat(100)}\n\n\`\`\`\na\n\n b\n\`\`\``;
    expect(emBaloes(t)).toEqual([t]);
  });
});

describe("pausaDeDigitacao", () => {
  it("fica entre 0,8 s e 2,5 s", () => {
    expect(pausaDeDigitacao("oi")).toBe(824);
    expect(pausaDeDigitacao("x".repeat(1000))).toBe(2500);
  });
});
