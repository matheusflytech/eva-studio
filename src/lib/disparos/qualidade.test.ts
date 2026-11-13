import { describe, expect, it } from "vitest";
import { qualidadeDoChip } from "./qualidade";

describe("qualidadeDoChip", () => {
  it("poucos envios não avalia", () => {
    expect(qualidadeDoChip({ enviados: 10, entregues: 10, falhas: 0 }).nivel).toBe("sem_dados");
  });
  it("entrega alta e pouca falha é boa", () => {
    expect(qualidadeDoChip({ enviados: 100, entregues: 95, falhas: 2 }).nivel).toBe("boa");
  });
  it("falha entre 5% e 15% pede atenção", () => {
    expect(qualidadeDoChip({ enviados: 90, entregues: 85, falhas: 10 }).nivel).toBe("atencao");
  });
  it("falha alta ou entrega baixa é ruim", () => {
    expect(qualidadeDoChip({ enviados: 80, entregues: 75, falhas: 20 }).nivel).toBe("ruim");
    expect(qualidadeDoChip({ enviados: 100, entregues: 40, falhas: 0 }).nivel).toBe("ruim");
  });
  it("devolve as taxas", () => {
    const q = qualidadeDoChip({ enviados: 100, entregues: 90, falhas: 0 });
    expect(q.taxaDeEntrega).toBeCloseTo(0.9);
    expect(q.taxaDeFalha).toBe(0);
  });
});
