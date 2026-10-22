import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { BANDEIRAS, formatarTelefone, linkDoWhatsAppWeb } from "./telefone";

describe("formatarTelefone", () => {
  it("celular brasileiro gravado com DDI vira +55 DD 9XXXX-XXXX com bandeira", () => {
    expect(formatarTelefone("5521981710669")).toEqual({
      texto: "+55 21 98171-0669",
      digitos: "5521981710669",
      pais: { iso: "br", nome: "Brasil", ddi: "55" },
    });
  });

  it("fixo brasileiro e máscara antiga", () => {
    expect(formatarTelefone("552131710669")?.texto).toBe("+55 21 3171-0669");
    expect(formatarTelefone("+55 (11) 99999-8888")?.texto).toBe("+55 11 99999-8888");
  });

  it("registro antigo sem DDI (DDD + número) é tratado como Brasil", () => {
    const t = formatarTelefone("(21) 98171-0669");
    expect(t?.texto).toBe("+55 21 98171-0669");
    expect(t?.digitos).toBe("5521981710669");
    expect(t?.pais?.iso).toBe("br");
  });

  it("outros países pelo DDI, com o DDI mais longo primeiro", () => {
    expect(formatarTelefone("+1 415 555 0100")).toMatchObject({ texto: "+1 415 555 0100", pais: { iso: "us" } });
    expect(formatarTelefone("+351912345678")).toMatchObject({ texto: "+351 912 345 678", pais: { iso: "pt" } });
    expect(formatarTelefone("+59899123456")).toMatchObject({ texto: "+598 9912 3456", pais: { iso: "uy" } });
    expect(formatarTelefone("00 34 612 345 678")).toMatchObject({ texto: "+34 612 345 678", pais: { iso: "es" } });
  });

  it("DDI desconhecido: +dígitos agrupados, sem país", () => {
    expect(formatarTelefone("+81312345678")).toEqual({ texto: "+813 1234 5678", digitos: "81312345678", pais: null });
  });

  it("vazio, curto e lixo", () => {
    expect(formatarTelefone("")).toBeNull();
    expect(formatarTelefone(null)).toBeNull();
    expect(formatarTelefone("ramal 23")).toEqual({ texto: "ramal 23", digitos: "23", pais: null });
    expect(formatarTelefone("sem número")).toEqual({ texto: "sem número", digitos: "", pais: null });
  });

  it("toda bandeira do catálogo tem SVG local", () => {
    for (const iso of BANDEIRAS) {
      expect(existsSync(path.resolve(__dirname, `../../public/bandeiras/${iso}.svg`)), iso).toBe(true);
    }
  });
});

describe("linkDoWhatsAppWeb", () => {
  it("número completo vira link do WhatsApp Web com DDI", () => {
    expect(linkDoWhatsAppWeb("+55 21 98171-0669")).toBe("https://web.whatsapp.com/send?phone=5521981710669");
    expect(linkDoWhatsAppWeb("(21) 98171-0669")).toBe("https://web.whatsapp.com/send?phone=5521981710669");
    expect(linkDoWhatsAppWeb("+351 912 345 678")).toBe("https://web.whatsapp.com/send?phone=351912345678");
  });

  it("sem número completo, sem botão", () => {
    expect(linkDoWhatsAppWeb("")).toBeNull();
    expect(linkDoWhatsAppWeb(null)).toBeNull();
    expect(linkDoWhatsAppWeb("2345")).toBeNull();
    expect(linkDoWhatsAppWeb("ramal 12")).toBeNull();
  });
});
