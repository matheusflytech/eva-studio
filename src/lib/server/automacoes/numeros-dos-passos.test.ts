import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  automacaoExecucao: { count: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { numerosDosPassos } from "./telas";

describe("numerosDosPassos", () => {
  it("conta por bloco, mostra o erro só se a última vez falhou e o gatilho leva o total", async () => {
    db.$queryRaw.mockResolvedValue([
      { noId: "zap", execucoes: 12, ultimoStatus: "falhou", ultimoErro: "Modelo não aprovado", ultimaEm: new Date("2026-10-25T10:00:00Z") },
      { noId: "tarefa", execucoes: 9, ultimoStatus: "ok", ultimoErro: "erro antigo", ultimaEm: new Date("2026-10-25T09:00:00Z") },
      { noId: "nota", execucoes: 1, ultimoStatus: "falhou", ultimoErro: null, ultimaEm: new Date("2026-10-24T09:00:00Z") },
    ]);
    db.automacaoExecucao.count.mockResolvedValue(15);

    const n = await numerosDosPassos("o1", "a1", new Date("2026-10-25T12:00:00Z"));
    expect(n.gatilho.execucoes).toBe(15);
    expect(n.zap).toEqual({ execucoes: 12, ultimoErro: "Modelo não aprovado", ultimaEm: "2026-10-25T10:00:00.000Z" });
    expect(n.tarefa.ultimoErro).toBeNull();
    expect(n.nota.ultimoErro).toBe("Falhou.");
    // Só execuções de verdade, do contrato, nos últimos 30 dias.
    expect(db.automacaoExecucao.count).toHaveBeenCalledWith({
      where: { automacaoId: "a1", orgId: "o1", teste: false, createdAt: { gte: new Date("2026-09-25T12:00:00Z") } },
    });
  });
});
