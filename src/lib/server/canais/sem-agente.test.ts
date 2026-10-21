import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ canal: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { detalheSemAgente, registrarMensagemSemAgente } from "./sem-agente";

beforeEach(() => vi.clearAllMocks());

describe("detalheSemAgente", () => {
  it("conta as mensagens e guarda a hora da última (horário de Brasília)", () => {
    const agora = new Date("2026-10-21T17:05:00Z");
    const um = detalheSemAgente(null, agora);
    expect(um).toBe("Recebendo mensagens sem agente: 1 (última 21/10/2026 às 14:05)");
    expect(detalheSemAgente(um, agora)).toMatch(/: 2 \(/);
    expect(detalheSemAgente("Webhook não registrado", agora)).toMatch(/: 1 \(/);
  });
});

describe("registrarMensagemSemAgente", () => {
  it("canal sem agente vai para atenção", async () => {
    db.canal.findFirst.mockResolvedValue({ id: "c", agentId: null, detalhe: null });
    await registrarMensagemSemAgente({ tipo: "whatsapp_meta", externalId: "pn" });
    expect(db.canal.findFirst.mock.calls[0][0].where).toEqual({ tipo: "whatsapp_meta", externalId: "pn" });
    expect(db.canal.update.mock.calls[0][0].data.status).toBe("atencao");
  });

  it("canal com agente ou inexistente: não mexe; sem tabela: não lança", async () => {
    db.canal.findFirst.mockResolvedValueOnce({ id: "c", agentId: "A", detalhe: null }).mockResolvedValueOnce(null);
    await registrarMensagemSemAgente({ canalId: "c" });
    await registrarMensagemSemAgente({ canalId: "x" });
    expect(db.canal.update).not.toHaveBeenCalled();
    db.canal.findFirst.mockRejectedValue(new Error("no table"));
    await expect(registrarMensagemSemAgente({ canalId: "c" })).resolves.toBeUndefined();
  });
});
