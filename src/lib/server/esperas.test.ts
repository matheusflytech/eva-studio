import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), $executeRaw: vi.fn() }));
const motor = vi.hoisted(() => ({ advanceConversation: vi.fn() }));
const outbound = vi.hoisted(() => ({ deliverToContact: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/flow-engine", () => motor);
vi.mock("@/lib/server/outbound", () => outbound);
vi.mock("@/lib/server/inbox", () => ({ CANAIS_POR_BUSCA: new Set(["website"]) }));

import { retomarEsperasVencidas } from "./esperas";

const vencida = (channel: string) => ({ id: "cv1", agentId: "a1", channel, contactId: "5511999990001", prazo: "2026-10-24T12:00:00.000Z" });

beforeEach(() => {
  vi.clearAllMocks();
  db.$executeRaw.mockResolvedValue(1);
  outbound.deliverToContact.mockResolvedValue({ ok: true });
  motor.advanceConversation.mockResolvedValue({
    status: "active",
    messages: [{ text: "Ainda quer o orçamento?", options: [{ id: "s", label: "Sim" }, { id: "n", label: "Não" }] }],
  });
});

describe("retomarEsperasVencidas", () => {
  it("retoma a espera vencida e manda as opções numeradas pelo canal", async () => {
    db.$queryRaw.mockResolvedValue([vencida("telegram")]);
    expect(await retomarEsperasVencidas()).toBe(1);
    expect(motor.advanceConversation).toHaveBeenCalledWith({ agentId: "a1", channel: "telegram", contactId: "5511999990001" });
    expect(outbound.deliverToContact).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", to: "5511999990001", text: "Ainda quer o orçamento?\n\n1. Sim\n2. Não" })
    );
  });

  it("não retoma quando outra rodada já tirou o prazo", async () => {
    db.$queryRaw.mockResolvedValue([vencida("whatsapp_meta")]);
    db.$executeRaw.mockResolvedValue(0);
    expect(await retomarEsperasVencidas()).toBe(0);
    expect(motor.advanceConversation).not.toHaveBeenCalled();
  });

  it("no chat do site só anda o fluxo: o site busca as mensagens", async () => {
    db.$queryRaw.mockResolvedValue([vencida("website")]);
    expect(await retomarEsperasVencidas()).toBe(1);
    expect(outbound.deliverToContact).not.toHaveBeenCalled();
  });

  it("uma conversa com erro não para as outras", async () => {
    db.$queryRaw.mockResolvedValue([vencida("instagram"), { ...vencida("instagram"), id: "cv2" }]);
    motor.advanceConversation.mockRejectedValueOnce(new Error("IA fora")).mockResolvedValueOnce({ status: "active", messages: [{ text: "Oi" }] });
    expect(await retomarEsperasVencidas()).toBe(1);
    expect(outbound.deliverToContact).toHaveBeenCalledTimes(1);
  });
});
