import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { externalIdDoCanal } from "./contacts";

describe("externalIdDoCanal", () => {
  it("WhatsApp QR grava o JID, igual ao que chega na conversa", () => {
    expect(externalIdDoCanal("whatsapp_qr", "(11) 99999-8888")).toBe("5511999998888@s.whatsapp.net");
    expect(externalIdDoCanal("whatsapp_qr", "5511999998888@s.whatsapp.net")).toBe("5511999998888@s.whatsapp.net");
  });
  it("WhatsApp oficial grava só dígitos com 55", () => {
    expect(externalIdDoCanal("whatsapp_meta", "(11) 99999-8888")).toBe("5511999998888");
  });
});
