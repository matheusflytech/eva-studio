import { describe, it, expect } from "vitest";
import { corpoDoMenu } from "./meta-menu";

const opcoes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, label: `Opção ${i + 1}` }));

describe("menu no WhatsApp oficial", () => {
  it("até 3 opções: botões", () => {
    const corpo = corpoDoMenu("55119", "Escolha", opcoes(3)) as { interactive: { type: string; action: { buttons: unknown[] } } };
    expect(corpo.interactive.type).toBe("button");
    expect(corpo.interactive.action.buttons).toHaveLength(3);
  });

  it("de 4 a 10 opções: lista com todas, nenhuma some", () => {
    const corpo = corpoDoMenu("55119", "Escolha", opcoes(4)) as {
      interactive: { type: string; action: { sections: { rows: { id: string }[] }[] } };
    };
    expect(corpo.interactive.type).toBe("list");
    expect(corpo.interactive.action.sections[0].rows.map((r) => r.id)).toEqual(["o1", "o2", "o3", "o4"]);
  });

  it("mais de 10: texto numerado com todas", () => {
    const corpo = corpoDoMenu("55119", "Escolha", opcoes(11)) as { type: string; text: { body: string } };
    expect(corpo.type).toBe("text");
    expect(corpo.text.body).toContain("11. Opção 11");
  });
});
