import { describe, it, expect, vi, beforeEach } from "vitest";

// Só o despacho dos eventos de template: o resto do webhook fica mockado.
const db = vi.hoisted(() => ({ metaConnection: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/flow-engine", () => ({ advanceConversation: vi.fn() }));
vi.mock("@/lib/server/comment-automation", () => ({ matchCommentAutomation: vi.fn() }));
vi.mock("@/lib/server/instagram-events", () => ({ classifyInstagramMessage: vi.fn() }));
vi.mock("@/lib/server/meta-signature", () => ({ verifyMetaSignature: () => true }));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => s }));
vi.mock("@/lib/server/rate-limit", () => ({ isFirstDelivery: vi.fn(async () => true), esquecerEntrega: vi.fn() }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ sendInstagramText: vi.fn(), sendMessengerText: vi.fn() }));
vi.mock("@/lib/server/media-inbound", () => ({
  baixarEGuardar: vi.fn(),
  guardarMidiaWhatsApp: vi.fn(),
  orgDoAgente: vi.fn(),
  textoDeAnexo: vi.fn(),
  tipoDoAnexoSocial: vi.fn(),
}));

const aplicar = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("@/lib/server/meta-template-eventos", async (original) => ({
  ...(await original<typeof import("@/lib/server/meta-template-eventos")>()),
  aplicarEventoDeTemplate: aplicar,
}));

import { POST } from "./route";

function evento(field: string, value: unknown) {
  return new Request("http://x/api/webhooks/meta", {
    method: "POST",
    headers: { "x-hub-signature-256": "sha256=ok" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba1", changes: [{ field, value }] }] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.META_APP_SECRET = "s";
});

describe("webhook da Meta: eventos de template", () => {
  it("status de template vai para o WABA da entrada, sem exigir phone_number_id", async () => {
    const res = await POST(
      evento("message_template_status_update", {
        event: "REJECTED",
        message_template_id: 5,
        message_template_name: "promo",
        message_template_language: "pt_BR",
        reason: "INVALID_FORMAT",
      })
    );
    expect(res.status).toBe(200);
    expect(aplicar).toHaveBeenCalledWith("waba1", expect.objectContaining({ tipo: "status", status: "REJECTED" }));
    expect(db.metaConnection.findUnique).not.toHaveBeenCalled();
  });

  it("mudança de categoria também", async () => {
    await POST(
      evento("template_category_update", {
        message_template_id: 5,
        message_template_name: "promo",
        message_template_language: "pt_BR",
        new_category: "MARKETING",
      })
    );
    expect(aplicar).toHaveBeenCalledWith("waba1", expect.objectContaining({ tipo: "categoria", categoria: "MARKETING" }));
  });

  it("falha ao gravar não derruba o webhook (a Meta reentregaria em loop)", async () => {
    aplicar.mockRejectedValueOnce(new Error("coluna não existe"));
    const res = await POST(evento("message_template_status_update", { event: "APPROVED", message_template_id: 5 }));
    expect(res.status).toBe(200);
  });
});
