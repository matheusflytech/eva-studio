import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ agenteEntrada: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ encryptSecret: (s: string) => s, decryptSecret: (s: string) => s }));

import { conferirEntrada, gerarTokenDaEntrada } from "./entrada-do-agente";

beforeEach(() => vi.clearAllMocks());

describe("URL de entrada do agente", () => {
  it("token gerado confere; outro token, não", async () => {
    const token = await gerarTokenDaEntrada("o1", "a1");
    expect(token).toMatch(/^evh_[0-9a-f]{48}$/);
    db.agenteEntrada.findUnique.mockResolvedValue({ agentId: "a1", orgId: "o1", token });
    expect(await conferirEntrada("a1", token)).toEqual({ orgId: "o1" });
    expect(await conferirEntrada("a1", `evh_${"0".repeat(48)}`)).toBeNull();
  });

  it("sem formato evh_ nem consulta o banco; sem tabela = recusa", async () => {
    expect(await conferirEntrada("a1", "qualquer")).toBeNull();
    expect(db.agenteEntrada.findUnique).not.toHaveBeenCalled();
    db.agenteEntrada.findUnique.mockRejectedValue(new Error("relation does not exist"));
    expect(await conferirEntrada("a1", "evh_x")).toBeNull();
  });
});
