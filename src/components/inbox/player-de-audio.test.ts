import { describe, it, expect } from "vitest";
import { alturasDaOnda } from "./player-de-audio";

describe("alturasDaOnda", () => {
  it("mesma mensagem, mesma onda; alturas entre 0,25 e 1", () => {
    const a = alturasDaOnda("msg-1");
    expect(a).toHaveLength(32);
    expect(alturasDaOnda("msg-1")).toEqual(a);
    expect(alturasDaOnda("msg-2")).not.toEqual(a);
    expect(a.every((h) => h >= 0.25 && h <= 1)).toBe(true);
  });
});
