import { describe, it, expect, vi, beforeEach } from "vitest";

const storage = vi.hoisted(() => ({ baixarMidia: vi.fn() }));
const voz = vi.hoisted(() => ({ transcreverAudio: vi.fn() }));
const leitura = vi.hoisted(() => ({ entenderAnexo: vi.fn(async (_o: string, _b: Buffer, mime: string) => `[leu ${mime}]`), MAX_ANEXO_BYTES: 100 }));
vi.mock("@/lib/server/storage", () => storage);
vi.mock("@/lib/server/transcribe", () => voz);
vi.mock("@/lib/server/anexos", () => leitura);

import { entenderAnexosDoWhatsApp, transcreverAudioDoWhatsApp } from "./anexos-whatsapp";

const audio = { path: "o1/a.ogg", type: "audio", mime: "audio/ogg" };

beforeEach(() => {
  vi.clearAllMocks();
  storage.baixarMidia.mockResolvedValue(Buffer.from("bytes"));
});

describe("transcreverAudioDoWhatsApp", () => {
  it("devolve o texto falado", async () => {
    voz.transcreverAudio.mockResolvedValue({ texto: "quero um orçamento", segundos: 12 });
    expect(await transcreverAudioDoWhatsApp("o1", audio)).toBe("quero um orçamento");
  });

  it("acima de 5 min (ou grande demais): avisa que a equipe vai ouvir", async () => {
    voz.transcreverAudio.mockResolvedValue({ texto: "…", segundos: 301 });
    expect(await transcreverAudioDoWhatsApp("o1", audio)).toMatch(/longo demais/);
    voz.transcreverAudio.mockResolvedValue({ erro: "tamanho" });
    expect(await transcreverAudioDoWhatsApp("o1", audio)).toMatch(/longo demais/);
  });

  it("falhou ou o arquivo sumiu: null (fica o [Áudio])", async () => {
    voz.transcreverAudio.mockResolvedValue({ erro: "falha" });
    expect(await transcreverAudioDoWhatsApp("o1", audio)).toBeNull();
    storage.baixarMidia.mockRejectedValue(new Error("500"));
    expect(await transcreverAudioDoWhatsApp("o1", audio)).toBeNull();
  });
});

describe("entenderAnexosDoWhatsApp", () => {
  it("lê foto e documento, ignora áudio e figurinha, no máximo 3", async () => {
    const r = await entenderAnexosDoWhatsApp("o1", [
      audio,
      { path: "1", type: "sticker", mime: "image/webp" },
      { path: "2", type: "image", mime: "image/jpeg" },
      { path: "3", type: "document", mime: "application/pdf", name: "conta.pdf" },
      { path: "4", type: "image", mime: "image/png" },
      { path: "5", type: "image", mime: "image/gif" },
    ]);
    expect(r).toBe("[leu image/jpeg]\n\n[leu application/pdf]\n\n[leu image/png]");
  });

  it("foto grande demais: pede para a pessoa resumir, sem chamar a visão", async () => {
    storage.baixarMidia.mockResolvedValue(Buffer.alloc(101));
    const r = await entenderAnexosDoWhatsApp("o1", [{ path: "2", type: "image", mime: "image/jpeg", name: "foto.jpg" }]);
    expect(r).toMatch(/foto\.jpg, grande demais/);
    expect(leitura.entenderAnexo).not.toHaveBeenCalled();
  });

  it("sem foto nem documento: nada", async () => {
    expect(await entenderAnexosDoWhatsApp("o1", [audio])).toBeUndefined();
  });
});
