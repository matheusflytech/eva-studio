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

import { conexoesDoAgente } from "./canais-do-contrato";

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
