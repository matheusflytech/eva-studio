import { describe, expect, it } from "vitest";
import { lerModelo } from "./modelo";

const valido = (p: string) => p.startsWith("org1/");

describe("lerModelo", () => {
  it("exige nome e texto (ou arquivo)", () => {
    expect(lerModelo({ text: "oi" }, valido)).toEqual({ ok: false, erro: "Dê um nome ao modelo." });
    expect(lerModelo({ name: "A" }, valido)).toEqual({ ok: false, erro: "Escreva o texto do modelo." });
  });
  it("limpa opções vazias e corta em 3", () => {
    const r = lerModelo({ name: "A", text: "oi", options: ["1", " ", "2", "3", "4"] }, valido);
    expect(r.ok && r.modelo.options).toEqual(["1", "2", "3"]);
  });
  it("arquivo só do próprio contrato e de tipo aceito", () => {
    expect(lerModelo({ name: "A", text: "oi", media: { path: "outro/x.png", type: "image" } }, valido).ok).toBe(false);
    expect(lerModelo({ name: "A", text: "oi", media: { path: "org1/x.png", type: "audio" } }, valido).ok).toBe(false);
    const r = lerModelo({ name: "A", text: "", media: { path: "org1/x.png", type: "image", name: "lista.png" } }, valido);
    expect(r.ok && r.modelo).toMatchObject({ mediaPath: "org1/x.png", mediaType: "image", mediaName: "lista.png" });
  });
});
