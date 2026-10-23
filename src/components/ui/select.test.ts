import * as React from "react";
import { describe, it, expect } from "vitest";
import { lerOpcoes } from "./select";

const h = React.createElement;

describe("Select: lê as opções dos filhos como o <select> lê", () => {
  it("option, optgroup, fragmento, lista e condicional", () => {
    const etapas = [{ id: "s1", nome: "Proposta" }, { id: "s2", nome: "Ganho" }];
    const grupos = lerOpcoes(
      h(
        React.Fragment,
        null,
        h("option", { value: "" }, "Escolha…"),
        false,
        h("optgroup", { label: "Etapas" }, etapas.map((e) => h("option", { key: e.id, value: e.id }, e.nome))),
        h("option", { value: 3, disabled: true }, "Três ", "opções"),
        h("option", null, "Sem valor")
      )
    );
    expect(grupos.map((g) => [g.label, g.opcoes.map((o) => [o.value, o.texto, o.disabled])])).toEqual([
      [null, [["", "Escolha…", false], ["3", "Três opções", true], ["Sem valor", "Sem valor", false]]],
      ["Etapas", [["s1", "Proposta", false], ["s2", "Ganho", false]]],
    ]);
  });

  it("sem opções: lista vazia", () => {
    expect(lerOpcoes(null)).toEqual([]);
  });
});
