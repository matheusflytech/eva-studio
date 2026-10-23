import { describe, it, expect } from "vitest";
import { DICIONARIO_VAZIO, formatarMudancas, resumoDaLinha, type Dicionario } from "./formatar";

const d: Dicionario = {
  ...DICIONARIO_VAZIO,
  pessoas: { u1: "Ana Souza", u2: "Bruno" },
  etapas: { s1: "Proposta", s2: "Negociação" },
  empresas: { co1: "Acme SA" },
  contatos: { c1: "Carla" },
  campos: {
    deal: {
      origem: { rotulo: "Origem do lead", tipo: "select", opcoes: [{ value: "site", label: "Site" }, { value: "indicacao", label: "Indicação" }] },
      vip: { rotulo: "Cliente VIP", tipo: "checkbox" },
      entrada: { rotulo: "Entrada", tipo: "currency" },
    },
  },
};

describe("formatarMudancas", () => {
  it("valor em reais, responsável e empresa pelo nome, data do dia", () => {
    const r = formatarMudancas(
      "deal",
      {
        amount_cents: { de: 500000, para: 800000 },
        owner_id: { de: "u1", para: "u2" },
        company_id: { de: null, para: "co1" },
        expected_closing_at: { de: "2026-11-10T00:00:00.000Z", para: "2026-11-30T00:00:00.000Z" },
      },
      d
    );
    // Intl separa "R$" do número com espaço fixo (U+00A0): o teste compara com espaço comum.
    const semNbsp = r.map((x) => ({ ...x, de: x.de.replace(/ /g, " "), para: x.para.replace(/ /g, " ") }));
    expect(semNbsp).toEqual([
      { campo: "amount_cents", rotulo: "Valor", de: "R$ 5.000,00", para: "R$ 8.000,00" },
      { campo: "owner_id", rotulo: "Responsável", de: "Ana Souza", para: "Bruno" },
      { campo: "company_id", rotulo: "Empresa", de: "vazio", para: "Acme SA" },
      { campo: "expected_closing_at", rotulo: "Previsão de fechamento", de: "10/11/2026", para: "30/11/2026" },
    ]);
  });

  it("campo personalizado pelo rótulo e pelo tipo", () => {
    const r = formatarMudancas(
      "deal",
      {
        "custom_fields.origem": { de: "site", para: "indicacao" },
        "custom_fields.vip": { de: false, para: true },
        "custom_fields.sumiu": { de: "a", para: "b" },
      },
      d
    );
    expect(r).toEqual([
      { campo: "custom_fields.origem", rotulo: "Origem do lead", de: "Site", para: "Indicação" },
      { campo: "custom_fields.vip", rotulo: "Cliente VIP", de: "Não", para: "Sim" },
      { campo: "custom_fields.sumiu", rotulo: "sumiu", de: "a", para: "b" },
    ]);
  });

  it("etiquetas e permissões: o que entrou e o que saiu", () => {
    const r = formatarMudancas(
      "contact",
      {
        tags: { de: [{ id: "t1", name: "Quente" }], para: [{ id: "t2", name: "VIP" }] },
        permissoes: { de: ["negocios:ver"], para: ["negocios:editar", "negocios:ver"] },
      },
      d
    );
    expect(r).toEqual([
      { campo: "tags", rotulo: "Etiquetas", de: "", para: "+ VIP, − Quente" },
      { campo: "permissoes", rotulo: "Permissões", de: "", para: "+ Negócios: Editar" },
    ]);
  });

  it("campos técnicos somem; na ficha, a etapa também (ela tem o próprio item)", () => {
    const m = { stage_id: { de: "s1", para: "s2" }, status: { de: "open", para: "won" }, stage_since: { de: "x", para: "y" }, name: { de: "A", para: "B" } };
    expect(formatarMudancas("deal", m, d).map((x) => x.campo)).toEqual(["stage_id", "name"]);
    expect(formatarMudancas("deal", m, d)[0]).toMatchObject({ de: "Proposta", para: "Negociação" });
    expect(formatarMudancas("deal", m, d, { semEtapa: true }).map((x) => x.campo)).toEqual(["name"]);
  });

  it("id que não existe mais vira 'removido'; nulo vira 'vazio'", () => {
    expect(formatarMudancas("deal", { owner_id: { de: "u-saiu", para: null } }, d)).toEqual([{ campo: "owner_id", rotulo: "Responsável", de: "removido", para: "vazio" }]);
  });
});

describe("resumoDaLinha", () => {
  const base = { objeto: "deal" as const, objetoNome: "Acme", detalhes: {} };
  it("registros", () => {
    expect(resumoDaLinha({ ...base, acao: "alterou" }, 2)).toBe("Alterou 2 campos");
    expect(resumoDaLinha({ ...base, acao: "alterou" }, 1)).toBe("Alterou 1 campo");
    expect(resumoDaLinha({ ...base, acao: "criou" }, 0)).toBe("Criou o negócio");
    expect(resumoDaLinha({ ...base, acao: "apagou", detalhes: { lixeira: true } }, 0)).toBe("Apagou o negócio (foi para a lixeira)");
    expect(resumoDaLinha({ ...base, objeto: "contact", acao: "restaurou" }, 0)).toBe("Restaurou o contato da lixeira");
  });

  it("conta", () => {
    expect(resumoDaLinha({ acao: "exportou", objeto: "export", objetoNome: "Contatos", detalhes: { entidade: "contatos", quantidade: 1240 } }, 0)).toBe("Exportou 1.240 contatos");
    expect(resumoDaLinha({ acao: "exportou", objeto: "export", objetoNome: "x", detalhes: { entidade: "negocios", quantidade: 1, funil: "Vendas", formato: "relatório" } }, 0)).toBe(
      "Exportou 1 negócio do funil Vendas (relatório)"
    );
    expect(resumoDaLinha({ acao: "membro.convidou", objeto: "member", objetoNome: "Bia", detalhes: { email: "bia@x.com", papel: "Atendente" } }, 0)).toBe("Convidou Bia (bia@x.com) como Atendente");
    expect(resumoDaLinha({ acao: "chave_api.criou", objeto: "api_key", objetoNome: "n8n", detalhes: { prefixo: "evs_live_4f2a" } }, 0)).toBe("Criou a chave de API n8n (evs_live_4f2a…)");
    expect(resumoDaLinha({ acao: "membro.mudou_acesso", objeto: "member", objetoNome: "Bruno", detalhes: {} }, 1)).toBe("Mudou o acesso de Bruno");
  });
});
