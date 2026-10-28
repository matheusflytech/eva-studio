import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { sameSecret, suggestStages } from "./connection";

describe("suggestStages", () => {
  it("liga papel pelo nome da etapa, sem acento nem maiúscula", () => {
    const r = suggestStages([{ id: "1", name: "Membro ativo" }, { id: "2", name: "Pagamento Pendente" }, { id: "3", name: "Etapa nova" }, { id: "4", name: "Ex-Membro" }]);
    expect(r).toEqual({ active: "1", overdue: "2", former: "4" });
  });
});

describe("sameSecret", () => {
  it("só aceita igual e não vazio", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});
