import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findMany: vi.fn() },
  metaConnection: { findUnique: vi.fn(), update: vi.fn() },
  instagramConnection: { findUnique: vi.fn(), update: vi.fn() },
  messengerConnection: { findUnique: vi.fn(), update: vi.fn() },
  telegramConnection: { findUnique: vi.fn(), update: vi.fn() },
}));
const tg = vi.hoisted(() => ({ registrarWebhookDoTelegram: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => `claro-${s}` }));
vi.mock("@/lib/server/telegram-webhook", () => tg);

import { conexoesDoAgente, trocarAgenteDoCanal } from "./canais-do-contrato";

const vazio = {
  id: "a1", name: "Vendas", widgetEnabled: false,
  whatsappConnection: null, metaConnection: null, instagramConnection: null,
  telegramConnection: null, messengerConnection: null, tiktokConnection: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
});

describe("conexoesDoAgente", () => {
  it("junta as conexões do agente com rótulo e situação", () => {
    const r = conexoesDoAgente({
      ...vazio,
      metaConnection: { displayPhone: "+55 11 4000-0000", phoneNumberId: "pn" },
      whatsappConnection: { status: "qr_pending", phoneNumber: null, lastError: null },
      instagramConnection: { username: "loja", igBusinessId: "ig" },
      telegramConnection: { botUsername: "lojabot", webhookSet: false, lastError: "Bad Request" },
      tiktokConnection: { displayName: "Loja", lastError: null, expiresAt: new Date("2026-01-01") },
    }, new Date("2026-10-21"));
    expect(r.map((c) => [c.tipo, c.rotulo, c.situacao])).toEqual([
      ["whatsapp_meta", "+55 11 4000-0000", "conectado"],
      ["whatsapp_qr", "Número ainda não lido", "pendente"],
      ["instagram", "@loja", "conectado"],
      ["telegram", "@lojabot", "atencao"],
      ["tiktok", "Loja", "atencao"],
    ]);
    expect(r.every((c) => c.agentId === "a1" && c.agentNome === "Vendas")).toBe(true);
  });

  it("WhatsApp QR desconectado não conta como canal", () => {
    expect(conexoesDoAgente({ ...vazio, whatsappConnection: { status: "disconnected", phoneNumber: "x", lastError: null } })).toEqual([]);
  });
});

describe("trocarAgenteDoCanal", () => {
  it("WhatsApp oficial: a conexão passa para o outro agente", async () => {
    db.metaConnection.findUnique.mockResolvedValue(null);
    const r = await trocarAgenteDoCanal("o1", "whatsapp_meta", "a1", "a2");
    expect(r.ok).toBe(true);
    expect(db.metaConnection.update).toHaveBeenCalledWith({ where: { agentId: "a1" }, data: { agentId: "a2" } });
    expect(db.agent.findMany.mock.calls[0][0].where).toEqual({ orgId: "o1", id: { in: ["a1", "a2"] } });
  });

  it("agente de outro contrato: recusa", async () => {
    db.agent.findMany.mockResolvedValue([{ id: "a1" }]);
    expect(await trocarAgenteDoCanal("o1", "instagram", "a1", "alheio")).toMatchObject({ ok: false, status: 404 });
    expect(db.instagramConnection.update).not.toHaveBeenCalled();
  });

  it("destino já tem um canal desse tipo: recusa", async () => {
    db.messengerConnection.findUnique.mockResolvedValue({ agentId: "a2" });
    expect(await trocarAgenteDoCanal("o1", "messenger", "a1", "a2")).toMatchObject({ ok: false, status: 409 });
    expect(db.messengerConnection.update).not.toHaveBeenCalled();
  });

  it("Telegram: move e registra o webhook com o id do novo agente", async () => {
    db.telegramConnection.findUnique.mockResolvedValue(null);
    db.telegramConnection.update.mockResolvedValueOnce({ botToken: "cifrado" });
    tg.registrarWebhookDoTelegram.mockResolvedValue({ ok: true, erro: null });
    const r = await trocarAgenteDoCanal("o1", "telegram", "a1", "a2");
    expect(r).toEqual({ ok: true });
    expect(tg.registrarWebhookDoTelegram).toHaveBeenCalledWith("claro-cifrado", "a2");
    expect(db.telegramConnection.update.mock.calls[1][0]).toEqual({ where: { agentId: "a2" }, data: { webhookSet: true, lastError: null } });
  });

  it("WhatsApp QR e TikTok pedem reconectar, sem mexer em nada", async () => {
    expect(await trocarAgenteDoCanal("o1", "whatsapp_qr", "a1", "a2")).toMatchObject({ ok: false, status: 409 });
    expect(await trocarAgenteDoCanal("o1", "tiktok", "a1", "a2")).toMatchObject({ ok: false, status: 409 });
    expect(db.agent.findMany).not.toHaveBeenCalled();
  });
});
