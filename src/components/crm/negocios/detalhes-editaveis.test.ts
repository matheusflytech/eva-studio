import { describe, expect, it } from "vitest";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { corpoDoPersonalizado } from "./detalhes-editaveis";

const def = (over: Partial<DefinicaoDeCampo>): DefinicaoDeCampo =>
  ({ key: "segmento", label: "Segmento", type: "text", options: [], required: false, ...over }) as DefinicaoDeCampo;

describe("corpoDoPersonalizado", () => {
  it("manda só a chave do campo editado", () => {
    expect(corpoDoPersonalizado(def({}), "Varejo")).toEqual({ customFields: { segmento: "Varejo" } });
  });

  it("vazio limpa o campo (null) e caixa desmarcada é false", () => {
    expect(corpoDoPersonalizado(def({}), "  ")).toEqual({ customFields: { segmento: null } });
    expect(corpoDoPersonalizado(def({ key: "vip", type: "checkbox" }), false)).toEqual({ customFields: { vip: false } });
  });

  it("múltipla escolha vazia vira null", () => {
    expect(corpoDoPersonalizado(def({ key: "tags", type: "multiselect" }), [])).toEqual({ customFields: { tags: null } });
    expect(corpoDoPersonalizado(def({ key: "tags", type: "multiselect" }), ["a"])).toEqual({ customFields: { tags: ["a"] } });
  });
});
