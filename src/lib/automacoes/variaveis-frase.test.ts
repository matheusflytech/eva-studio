import { describe, it, expect } from "vitest";
import { renderizar, renderizarConfig, variaveisDoTexto } from "./variaveis";
import { fraseDaAutomacao } from "./frase";
import { exemploProposta } from "./exemplo.test-helpers";
import { ACOES, GATILHOS } from "./catalogo";

const ctx = {
  contato: { name: "ana souza", phone: "+5511987654321" },
  registro: { amount_cents: 150000, created_at: "2026-10-21T13:30:00Z" },
};

describe("variáveis", () => {
  it("filtros da lista fechada", () => {
    expect(renderizar("Oi {{ contato.name | primeiro_nome | maiusculas }}", ctx).texto).toBe("Oi ANA");
    expect(renderizar("{{registro.amount_cents | moeda}}", ctx).texto).toBe("R$ 1.500,00");
    expect(renderizar("{{contato.phone|telefone}}", ctx).texto).toBe("(11) 98765-4321");
    expect(renderizar("{{registro.created_at | data}}", ctx).texto).toBe("21/10/2026");
  });

  it("faltando vira vazio e é listado; com padrao não", () => {
    expect(renderizar("Oi {{contato.apelido}}!", ctx)).toEqual({ texto: "Oi !", faltando: ["contato.apelido"] });
    expect(renderizar('Oi {{contato.apelido | padrao:"cliente"}}!', ctx)).toEqual({ texto: "Oi cliente!", faltando: [] });
  });

  it("config inteira e lista de variáveis usadas", () => {
    const faltando: string[] = [];
    expect(renderizarConfig({ a: ["{{contato.name}}", 3], b: { c: "x {{nada}}" } }, ctx, faltando)).toEqual({ a: ["ana souza", 3], b: { c: "x " } });
    expect(faltando).toEqual(["nada"]);
    expect(variaveisDoTexto('{{ a.b | padrao:"x" }} e {{c}}')).toEqual([
      { caminho: "a.b", filtros: [{ nome: "padrao", argumento: "x" }] },
      { caminho: "c", filtros: [] },
    ]);
  });
});

describe("frase legível", () => {
  it("resume o fluxo com os nomes que a tela conhece", () => {
    const nomes = { etapa: (id: string) => ({ s_prop: "Proposta" })[id], modelo_whatsapp: () => "lembrete_proposta" };
    expect(fraseDaAutomacao(exemploProposta(), nomes)).toBe(
      "Quando um negócio entrar em Proposta: esperar 2 dias úteis; se Etapa é Proposta, mandar o modelo lembrete_proposta no WhatsApp, " +
        "criar a tarefa “Ligar para {{contato.name | primeiro_nom…” para daqui a 1 dia útil; senão, anotar “Saiu de Proposta antes do follow-up”."
    );
  });

  it("sem gatilho", () => {
    expect(fraseDaAutomacao({ ...exemploProposta(), gatilho: null, inicio: null })).toBe("Quando… (escolha o gatilho).");
  });

  it("todo item do catálogo tem frase com config vazia e tipo único", () => {
    for (const g of GATILHOS) expect(typeof g.frase({}, {})).toBe("string");
    for (const a of ACOES) expect(typeof a.frase({}, {})).toBe("string");
    expect(new Set(GATILHOS.map((g) => g.tipo)).size).toBe(GATILHOS.length);
    expect(new Set(ACOES.map((a) => a.tipo)).size).toBe(ACOES.length);
  });

  it("data relativa: antes, no dia e depois", () => {
    const g = GATILHOS.find((x) => x.tipo === "contact.date_relative")!;
    const n = { campo_data: () => "Aniversário" };
    expect(g.frase({ campo: "x", dias: 0 }, n)).toBe("No dia de Aniversário");
    expect(g.frase({ campo: "x", dias: -3 }, n)).toBe("Quando faltarem 3 dias para Aniversário");
    expect(g.frase({ campo: "x", dias: -1 }, n)).toBe("Quando faltar 1 dia para Aniversário");
    expect(g.frase({ campo: "x", dias: 2 }, n)).toBe("2 dias depois de Aniversário");
  });
});
