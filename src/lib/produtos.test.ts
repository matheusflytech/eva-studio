import { describe, it, expect } from "vitest";
import {
  lerDesconto,
  lerQuantidade,
  lerRecorrencia,
  resumoDosItens,
  resumoDosProdutos,
  rotuloDaRecorrencia,
  textoDoDesconto,
  totalDoItem,
  valorVemDosProdutos,
} from "./produtos";

describe("totalDoItem", () => {
  it("quantidade × preço, sem desconto", () => {
    expect(totalDoItem({ unitPriceCents: 10_000, quantity: 3, discountType: "percentual", discountValue: 0 })).toBe(30_000);
  });
  it("desconto percentual em centésimos de ponto (1000 = 10%)", () => {
    expect(totalDoItem({ unitPriceCents: 10_000, quantity: 3, discountType: "percentual", discountValue: 1000 })).toBe(27_000);
  });
  it("desconto em reais (centavos)", () => {
    expect(totalDoItem({ unitPriceCents: 10_000, quantity: 3, discountType: "valor", discountValue: 5_000 })).toBe(25_000);
  });
  it("desconto maior que o bruto zera, nunca fica negativo", () => {
    expect(totalDoItem({ unitPriceCents: 1_000, quantity: 1, discountType: "valor", discountValue: 9_000 })).toBe(0);
    expect(totalDoItem({ unitPriceCents: 1_000, quantity: 1, discountType: "percentual", discountValue: 20_000 })).toBe(0);
  });
  it("quantidade fracionada arredonda no centavo", () => {
    // 1,5 × 33,33 = 49,995 → 50,00
    expect(totalDoItem({ unitPriceCents: 3_333, quantity: 1.5, discountType: "percentual", discountValue: 0 })).toBe(5_000);
  });
  it("aceita quantidade em texto (Decimal do Prisma vira string no JSON)", () => {
    expect(totalDoItem({ unitPriceCents: 1_000, quantity: "2.5", discountType: "percentual", discountValue: 0 })).toBe(2_500);
  });
});

describe("resumoDosItens", () => {
  it("soma tudo e separa único, MRR e ARR", () => {
    const r = resumoDosItens([
      { totalCents: 50_000, recurrence: "unico" },
      { totalCents: 9_900, recurrence: "mensal" },
      { totalCents: 120_000, recurrence: "anual" },
    ]);
    expect(r.totalCents).toBe(179_900);
    expect(r.unicoCents).toBe(50_000);
    // mensal inteiro + anual/12
    expect(r.mrrCents).toBe(9_900 + 10_000);
    expect(r.arrCents).toBe((9_900 + 10_000) * 12);
    expect(r.temRecorrencia).toBe(true);
    expect(r.quantidade).toBe(3);
  });
  it("sem recorrência: MRR e ARR zerados", () => {
    const r = resumoDosItens([{ totalCents: 100, recurrence: "unico" }]);
    expect(r).toMatchObject({ totalCents: 100, mrrCents: 0, arrCents: 0, temRecorrencia: false });
  });
  it("lista vazia", () => {
    expect(resumoDosItens([])).toMatchObject({ totalCents: 0, quantidade: 0, temRecorrencia: false });
  });
});

describe("resumoDosProdutos (cartão)", () => {
  it("vazio quando não há itens", () => {
    expect(resumoDosProdutos([])).toBe("");
  });
  it("um produto", () => {
    expect(resumoDosProdutos(["Plano Pro"])).toBe("1 produto · Plano Pro");
  });
  it("vários: conta, o primeiro e quantos mais", () => {
    expect(resumoDosProdutos(["Plano Pro", "Implantação", "Treinamento"])).toBe("3 produtos · Plano Pro +2");
  });
});

describe("lerQuantidade", () => {
  it("aceita vírgula e ponto", () => {
    expect(lerQuantidade("1,5")).toBe(1.5);
    expect(lerQuantidade("2.25")).toBe(2.25);
    expect(lerQuantidade(3)).toBe(3);
  });
  it("arredonda em 3 casas", () => {
    expect(lerQuantidade("1,23456")).toBe(1.235);
  });
  it("recusa zero, negativo, texto e acima do teto", () => {
    expect(lerQuantidade(0)).toBeNull();
    expect(lerQuantidade("-1")).toBeNull();
    expect(lerQuantidade("muito")).toBeNull();
    expect(lerQuantidade(1_000_001)).toBeNull();
    expect(lerQuantidade(null)).toBeNull();
  });
  it("undefined = não veio", () => {
    expect(lerQuantidade(undefined)).toBeUndefined();
  });
});

describe("lerDesconto", () => {
  it("percentual vira centésimos de ponto", () => {
    expect(lerDesconto("percentual", "10,5")).toBe(1050);
    expect(lerDesconto("percentual", 100)).toBe(10_000);
  });
  it("percentual acima de 100 é inválido", () => {
    expect(lerDesconto("percentual", 101)).toBeNull();
  });
  it("valor vira centavos", () => {
    expect(lerDesconto("valor", "R$ 50,00")).toBe(5_000);
    expect(lerDesconto("valor", 12.34)).toBe(1_234);
  });
  it("vazio = sem desconto; negativo é inválido", () => {
    expect(lerDesconto("valor", "")).toBe(0);
    expect(lerDesconto("percentual", -5)).toBeNull();
  });
});

describe("recorrência", () => {
  it("lê os três tipos e recusa o resto", () => {
    expect(lerRecorrencia("unico")).toBe("unico");
    expect(lerRecorrencia("mensal")).toBe("mensal");
    expect(lerRecorrencia("anual")).toBe("anual");
    expect(lerRecorrencia("semanal")).toBeNull();
  });
  it("rótulos humanos", () => {
    expect(rotuloDaRecorrencia("unico")).toBe("Único");
    expect(rotuloDaRecorrencia("mensal")).toBe("Mensal");
    expect(rotuloDaRecorrencia("anual")).toBe("Anual");
  });
});

describe("valorVemDosProdutos", () => {
  it("só com itens, sem valor manual e com a tabela ativa", () => {
    expect(valorVemDosProdutos({ disponivel: true, itens: [1], valorManual: false })).toBe(true);
    expect(valorVemDosProdutos({ disponivel: true, itens: [1], valorManual: true })).toBe(false);
    expect(valorVemDosProdutos({ disponivel: true, itens: [], valorManual: false })).toBe(false);
    expect(valorVemDosProdutos({ disponivel: false, itens: [1], valorManual: false })).toBe(false);
    expect(valorVemDosProdutos(null)).toBe(false);
  });
});

describe("textoDoDesconto", () => {
  it("formata percentual e valor", () => {
    expect(textoDoDesconto("percentual", 1050)).toBe("10,5%");
    expect(textoDoDesconto("valor", 5_000)).toMatch(/R\$\s?50,00/);
    expect(textoDoDesconto("percentual", 0)).toBe("");
  });
});
