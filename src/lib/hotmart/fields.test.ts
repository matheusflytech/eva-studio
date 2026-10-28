import { describe, it, expect } from "vitest";
import { compatible, hotmartFields, remap, statusFieldId, targetKey } from "./fields";

const club = { slug: "drawing-club", name: "Drawing Club", model: "subscription" as const, pipelineId: "p", stages: {} };
const ebook = { slug: "ebook", name: "E-book", model: "one_time" as const, pipelineId: "p2", stages: {} };

describe("campos da Hotmart", () => {
  it("status da assinatura por produto mantém a chave da Renata", () => {
    expect(statusFieldId("drawing-club")).toBe("status_drawing_club");
  });

  it("catálogo: produtos comprados com os produtos ligados; dados de assinatura só com assinatura", () => {
    const soEbook = hotmartFields({ "1": ebook, "2": ebook });
    expect(soEbook.find((f) => f.id === "produtos_comprados")?.options).toEqual([{ value: "ebook", label: "E-book" }]);
    expect(soEbook.some((f) => f.id === "plano" || f.id.startsWith("status_"))).toBe(false);
    const comClub = hotmartFields({ "1": ebook, "3": club });
    expect(comClub.find((f) => f.id === "status_drawing_club")).toMatchObject({ entity: "contact", type: "select" });
    expect(comClub.some((f) => f.id === "plano")).toBe(true);
  });

  it("sem mapa grava na chave padrão; mapa troca o destino ou não grava", () => {
    expect(remap({}, { ltv_hotmart: 100 })).toEqual({ ltv_hotmart: 100 });
    expect(remap({ ltv_hotmart: "valor_total", cupom: null }, { ltv_hotmart: 100, cupom: "X", src: "ig" })).toEqual({ valor_total: 100, src: "ig" });
    expect(targetKey({ cpf_cnpj: null }, "cpf_cnpj")).toBeNull();
  });

  it("tipos compatíveis: mesmo tipo, ou texto recebendo texto/lista/data", () => {
    expect(compatible("currency", "currency")).toBe(true);
    expect(compatible("select", "text")).toBe(true);
    expect(compatible("currency", "text")).toBe(false);
    expect(compatible("multiselect", "text")).toBe(false);
  });
});
