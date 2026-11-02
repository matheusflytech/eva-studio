import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const db = vi.hoisted(() => ({
  prisma: {
    canal: { findFirst: vi.fn() },
    canalWhatsAppQr: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/db/prisma", () => db);

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ canalId: "c1" }) };
const post = (body?: unknown) => POST(new Request("http://x/api/canais/c1/qr", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }), params);
const ausente = () => Object.assign(new Error("column does not exist"), { code: "P2022" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.prisma.canal.findFirst.mockResolvedValue({ id: "c1" });
  db.prisma.canalWhatsAppQr.upsert.mockResolvedValue({ canalId: "c1" });
});

describe("POST /api/canais/[canalId]/qr", () => {
  it("sem corpo: pede a sessão de novo no modo QR (pareamento limpo)", async () => {
    expect((await post()).status).toBe(200);
    const arg = db.prisma.canalWhatsAppQr.upsert.mock.calls[0][0];
    expect(arg.update).toMatchObject({ status: "requesting", qrDataUrl: null, pairingPhone: null, pairingCode: null });
  });

  it("com número: guarda só os dígitos e pede o código", async () => {
    expect((await post({ pairingPhone: "+55 (11) 99999-0001" })).status).toBe(200);
    expect(db.prisma.canalWhatsAppQr.upsert.mock.calls[0][0].update.pairingPhone).toBe("5511999990001");
  });

  it("número curto, longo ou com lixo é recusado sem gravar", async () => {
    for (const pairingPhone of ["123", "1".repeat(16), "abc"]) {
      expect((await post({ pairingPhone })).status).toBe(400);
    }
    expect(db.prisma.canalWhatsAppQr.upsert).not.toHaveBeenCalled();
  });

  it("canal de outro contrato ou de outro tipo: 404", async () => {
    db.prisma.canal.findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(db.prisma.canal.findFirst).toHaveBeenCalledWith({ where: { id: "c1", orgId: "o1", tipo: "whatsapp_qr" }, select: { id: true } });
  });

  it("sem o SQL: o QR continua funcionando, o código dá 409", async () => {
    db.prisma.canalWhatsAppQr.upsert.mockRejectedValueOnce(ausente());
    expect((await post()).status).toBe(200);
    expect(db.prisma.canalWhatsAppQr.upsert).toHaveBeenCalledTimes(2);
    expect(db.prisma.canalWhatsAppQr.upsert.mock.calls[1][0].update).not.toHaveProperty("pairingPhone");

    db.prisma.canalWhatsAppQr.upsert.mockRejectedValueOnce(ausente());
    expect((await post({ pairingPhone: "5511999990001" })).status).toBe(409);
  });
});

describe("GET /api/canais/[canalId]/qr", () => {
  it("devolve código, tentativas e horas; sem o SQL cai para os campos antigos", async () => {
    const quando = new Date("2026-11-02T12:00:00Z");
    db.prisma.canalWhatsAppQr.findUnique.mockResolvedValueOnce({
      status: "qr_pending", qrDataUrl: null, phoneNumber: null, lastError: null, updatedAt: quando,
      pairingCode: "ABCD1234", pairingPhone: "5511999990001", reconnectAttempts: 2, lastConnectedAt: null, lastDisconnectedAt: quando,
    });
    const c = (await (await GET(new Request("http://x"), params)).json()).connection;
    expect(c).toMatchObject({ pairingCode: "ABCD1234", reconnectAttempts: 2, lastDisconnectedAt: "2026-11-02T12:00:00.000Z" });

    db.prisma.canalWhatsAppQr.findUnique.mockRejectedValueOnce(ausente());
    db.prisma.canalWhatsAppQr.findUnique.mockResolvedValueOnce({ status: "connected", qrDataUrl: null, phoneNumber: "5511", lastError: null, updatedAt: quando });
    const antigo = (await (await GET(new Request("http://x"), params)).json()).connection;
    expect(antigo).toMatchObject({ status: "connected", pairingCode: null, reconnectAttempts: 0 });
  });
});
