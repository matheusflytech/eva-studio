import { describe, it, expect } from "vitest";
import { linkDoWhatsapp } from "./subfluxos";

describe("linkDoWhatsapp", () => {
  it("monta o wa.me com a palavra-chave escrita, do número formatado ou só dígitos", () => {
    expect(linkDoWhatsapp("+55 21 98171-0669", "Segunda via")).toBe("https://wa.me/5521981710669?text=Segunda%20via");
    expect(linkDoWhatsapp("5521981710669", "orçamento")).toBe("https://wa.me/5521981710669?text=or%C3%A7amento");
    expect(linkDoWhatsapp("21 98171-0669", "oi")).toBe("https://wa.me/5521981710669?text=oi");
  });

  it("sem número de telefone ou sem palavra, não há link", () => {
    expect(linkDoWhatsapp("via QR", "oi")).toBeNull();
    expect(linkDoWhatsapp("", "oi")).toBeNull();
    expect(linkDoWhatsapp(null, "oi")).toBeNull();
    expect(linkDoWhatsapp("+55 21 98171-0669", "  ")).toBeNull();
    // Id do número na Meta (16 dígitos) não é telefone.
    expect(linkDoWhatsapp("1234567890123456", "oi")).toBeNull();
  });
});
