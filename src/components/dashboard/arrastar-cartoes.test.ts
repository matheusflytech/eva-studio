import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/crm/negocios/animacao/gsap", () => ({ CURVA: {}, Flip: {}, reduzMovimento: () => true }));

import { colunasPelaLargura, linhasPelaAltura, moverComTeclado, moverPara } from "./arrastar-cartoes";

describe("moverComTeclado", () => {
  const l = ["a", "b", "c"].map((id) => ({ id }));
  it("troca com o vizinho e não passa das pontas", () => {
    expect(ids(moverComTeclado(l, "b", 1))).toBe("acb");
    expect(ids(moverComTeclado(l, "b", -1))).toBe("bac");
    expect(moverComTeclado(l, "a", -1)).toBe(l);
    expect(moverComTeclado(l, "c", 1)).toBe(l);
  });
});

describe("linhasPelaAltura", () => {
  it("encaixa na linha mais perto, entre 1 e 3", () => {
    // linhas de 168 px com vão de 16
    expect(linhasPelaAltura(168, 168, 16)).toBe(1);
    expect(linhasPelaAltura(300, 168, 16)).toBe(2);
    expect(linhasPelaAltura(536, 168, 16)).toBe(3);
    expect(linhasPelaAltura(2000, 168, 16)).toBe(3);
    expect(linhasPelaAltura(10, 168, 16)).toBe(1);
  });
});

const ids = (l: { id: string }[]) => l.map((w) => w.id).join("");

describe("moverPara", () => {
  const l = ["a", "b", "c", "d"].map((id) => ({ id }));
  it("leva o cartão para o lugar do alvo, nos dois sentidos", () => {
    expect(ids(moverPara(l, "a", "c"))).toBe("bcad");
    expect(ids(moverPara(l, "d", "b"))).toBe("adbc");
  });
  it("id que não existe não mexe", () => {
    expect(moverPara(l, "x", "a")).toBe(l);
  });
});

describe("colunasPelaLargura", () => {
  it("arredonda para a coluna mais perto e fica entre 1 e o total", () => {
    // 3 colunas de 300 px com vão de 16
    expect(colunasPelaLargura(300, 300, 16, 3)).toBe(1);
    expect(colunasPelaLargura(500, 300, 16, 3)).toBe(2);
    expect(colunasPelaLargura(2000, 300, 16, 3)).toBe(3);
    expect(colunasPelaLargura(40, 300, 16, 3)).toBe(1);
  });
});
