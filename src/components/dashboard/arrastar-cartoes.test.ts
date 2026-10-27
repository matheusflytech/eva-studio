import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/crm/negocios/animacao/gsap", () => ({ CURVA: {}, Flip: {}, reduzMovimento: () => true }));

import { colunasPelaLargura, moverPara } from "./arrastar-cartoes";

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
