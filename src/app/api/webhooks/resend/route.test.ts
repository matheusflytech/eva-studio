import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

const db = vi.hoisted(() => ({
  emailEnvio: { findUnique: vi.fn(), update: vi.fn() },
  emailSupressao: { upsert: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { POST } from "./route";

const ENV = { ...process.env };
const SEGREDO_CRU = "segredo-do-webhook";

function requisicao(evento: unknown, assinar = true) {
  const corpo = JSON.stringify(evento);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v1," + crypto.createHmac("sha256", Buffer.from(SEGREDO_CRU)).update(`msg_1.${ts}.${corpo}`).digest("base64");
  return new Request("http://x/api/webhooks/resend", {
    method: "POST",
    body: corpo,
    headers: { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": assinar ? sig : "v1,AAAA" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from(SEGREDO_CRU).toString("base64");
  db.emailEnvio.findUnique.mockResolvedValue({ id: "env1", orgId: "o1", para: "ana@x.com", status: "entregue" });
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("POST /api/webhooks/resend", () => {
  it("assinatura inválida: 401 e nada muda", async () => {
    const r = await POST(requisicao({ type: "email.opened", data: { email_id: "em_1" } }, false));
    expect(r.status).toBe(401);
    expect(db.emailEnvio.update).not.toHaveBeenCalled();
  });

  it("aberto: atualiza situação e a hora", async () => {
    await POST(requisicao({ type: "email.opened", created_at: "2026-10-22T12:00:00Z", data: { email_id: "em_1" } }));
    expect(db.emailEnvio.findUnique).toHaveBeenCalledWith({ where: { resendId: "em_1" }, select: expect.any(Object) });
    expect(db.emailEnvio.update.mock.calls[0][0].data).toEqual({ status: "aberto", abertoEm: new Date("2026-10-22T12:00:00Z") });
  });

  it("bounce permanente: envio vira bounce e o endereço entra na supressão do contrato", async () => {
    await POST(requisicao({ type: "email.bounced", data: { email_id: "em_1", bounce: { type: "Permanent", message: "no such user" } } }));
    expect(db.emailEnvio.update.mock.calls[0][0].data.status).toBe("bounce");
    expect(db.emailSupressao.upsert.mock.calls[0][0].create).toMatchObject({ orgId: "o1", email: "ana@x.com", motivo: "bounce" });
  });

  it("reclamação de spam: supressão", async () => {
    await POST(requisicao({ type: "email.complained", data: { email_id: "em_1" } }));
    expect(db.emailSupressao.upsert.mock.calls[0][0].create.motivo).toBe("reclamacao");
  });

  it("evento de envio que não é nosso: 200 sem mexer", async () => {
    db.emailEnvio.findUnique.mockResolvedValue(null);
    const r = await POST(requisicao({ type: "email.delivered", data: { email_id: "outro" } }));
    expect(r.status).toBe(200);
    expect(db.emailEnvio.update).not.toHaveBeenCalled();
  });
});
