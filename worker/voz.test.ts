import { describe, it, expect, vi } from "vitest";
import { conteudoDeVoz, jaEhVoz, MIME_DE_VOZ, paraOggOpus } from "./voz.js";

describe("conteudoDeVoz", () => {
  it("ogg já é voz: manda direto pela URL", async () => {
    const baixar = vi.fn();
    expect(await conteudoDeVoz("u", "audio/ogg", { baixar })).toEqual({ audio: { url: "u" }, mimetype: MIME_DE_VOZ, ptt: true });
    expect(baixar).not.toHaveBeenCalled();
  });
  it("m4a/webm: converte e manda o buffer como voz", async () => {
    const baixar = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }));
    const converter = vi.fn(async () => Buffer.from("ogg"));
    const r = await conteudoDeVoz("u", "audio/mp4", { baixar: baixar as never, converter });
    expect(r).toEqual({ audio: Buffer.from("ogg"), mimetype: MIME_DE_VOZ, ptt: true });
  });
  it("conversão falhou: o original, ainda como voz", async () => {
    const baixar = vi.fn(async () => ({ ok: false, status: 500 }));
    expect(await conteudoDeVoz("u", "audio/webm", { baixar: baixar as never })).toEqual({ audio: { url: "u" }, mimetype: "audio/webm", ptt: true });
  });
  it("jaEhVoz", () => {
    expect(jaEhVoz("audio/ogg; codecs=opus")).toBe(true);
    expect(jaEhVoz("audio/mp4")).toBe(false);
  });
});

describe("paraOggOpus (ffmpeg de verdade)", () => {
  it("converte 0,2 s de silêncio wav em ogg", async () => {
    const amostras = 1600;
    const wav = Buffer.alloc(44 + amostras * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + amostras * 2, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(amostras * 2, 40);
    const ogg = await paraOggOpus(wav);
    expect(ogg.subarray(0, 4).toString()).toBe("OggS");
  }, 20000);
});
