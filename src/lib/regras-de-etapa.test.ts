import { describe, expect, it } from "vitest";
import {
  MOTIVOS_PADRAO,
  campoPreenchido,
  corpoDoModal,
  diasDeFollowUp,
  diasSemAtividade,
  lerMotivosDoCorpo,
  lerRegraDoCorpo,
  montarCamposDoModal,
  negocioParado,
  prazoDeParado,
  regraDoRegistro,
  regraPadrao,
  resolverPerda,
  validarMudancaDeEtapa,
  type EstadoDoNegocio,
  type EtapaDaRegra,
  type RegraDaEtapa,
} from "./regras-de-etapa";

const etapa = (id: string, position: number, type = "open", pipelineId = "p1"): EtapaDaRegra => ({ id, name: id.toUpperCase(), type, position, pipelineId });
const ETAPAS = [etapa("novo", 0), etapa("qualif", 1), etapa("proposta", 2), etapa("negoc", 3), etapa("ganho", 4, "won"), etapa("perdido", 5, "lost")];
const porId = (id: string) => ETAPAS.find((e) => e.id === id)!;

const VAZIO: EstadoDoNegocio = { amountCents: 0, expectedClosingAt: null, ownerId: null, companyId: null, contatos: 0, produtos: 0, customFields: {} };
const DEFS = [
  { key: "consumo", label: "Consumo", type: "number" },
  { key: "assinado", label: "Contrato assinado", type: "checkbox" },
];

function regras(r: Record<string, Partial<RegraDaEtapa>>): Map<string, RegraDaEtapa> {
  return new Map(Object.entries(r).map(([id, parcial]) => [id, { ...regraPadrao(porId(id).type), ...parcial }]));
}

const validar = (de: string | null, para: string, r: Map<string, RegraDaEtapa>, negocio = VAZIO, extra: { reabrir?: boolean; ignorarObrigatorios?: boolean } = {}) =>
  validarMudancaDeEtapa({ etapas: ETAPAS, regras: r, de: de ? porId(de) : null, para: porId(para), negocio, defs: DEFS, ...extra });

describe("validarMudancaDeEtapa", () => {
  it("sem regras, move", () => {
    expect(validar("novo", "proposta", new Map())).toEqual({ ok: true, ignorouObrigatorios: false, faltando: [] });
  });

  it("campo padrão faltando na etapa alvo → lista exata, não move", () => {
    const r = validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["valor", "previsao"] } }));
    expect(r.ok).toBe(false);
    if (r.ok || r.codigo !== "campos_obrigatorios") throw new Error();
    expect(r.faltando.map((f) => f.campo)).toEqual(["valor", "previsao"]);
    expect(r.mensagem).toContain("Valor, Previsão de fechamento");
  });

  it("campos padrão preenchidos passam", () => {
    const cheio: EstadoDoNegocio = { amountCents: 100, expectedClosingAt: "2026-11-01", ownerId: "u", companyId: "c", contatos: 1, produtos: 2, customFields: {} };
    const r = validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["valor", "previsao", "responsavel", "contato", "empresa", "produtos"] } }), cheio);
    expect(r.ok).toBe(true);
  });

  it("campo personalizado: vazio falta, preenchido passa; caixa obrigatória precisa estar marcada", () => {
    const r1 = validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["cf:consumo", "cf:assinado"] } }), { ...VAZIO, customFields: { consumo: "", assinado: false } });
    expect(!r1.ok && r1.codigo === "campos_obrigatorios" && r1.faltando.map((f) => f.rotulo)).toEqual(["Consumo", "Contrato assinado"]);
    const r2 = validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["cf:consumo", "cf:assinado"] } }), { ...VAZIO, customFields: { consumo: 480, assinado: true } });
    expect(r2.ok).toBe(true);
  });

  it("campo personalizado apagado não trava", () => {
    expect(validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["cf:sumiu"] } })).ok).toBe(true);
  });

  it("etapa pulada que NÃO pode ser pulada também exige os campos dela", () => {
    const r = validar("novo", "negoc", regras({ qualif: { camposObrigatorios: ["empresa"], podeSerPulada: false }, proposta: { camposObrigatorios: ["valor"] }, negoc: { camposObrigatorios: ["previsao"] } }));
    if (r.ok || r.codigo !== "campos_obrigatorios") throw new Error();
    // Proposta pode ser pulada: o valor dela não entra.
    expect(r.faltando.map((f) => [f.campo, f.etapaId])).toEqual([["empresa", "qualif"], ["previsao", "negoc"]]);
  });

  it("voltar de etapa olha só a alvo", () => {
    const r = validar("negoc", "novo", regras({ qualif: { camposObrigatorios: ["empresa"], podeSerPulada: false } }));
    expect(r.ok).toBe(true);
  });

  it("ganho pula todas as abertas depois da atual", () => {
    const r = validar("qualif", "ganho", regras({ negoc: { camposObrigatorios: ["valor"], podeSerPulada: false }, ganho: { camposObrigatorios: ["previsao"] } }));
    if (r.ok || r.codigo !== "campos_obrigatorios") throw new Error();
    expect(r.faltando.map((f) => f.campo)).toEqual(["valor", "previsao"]);
  });

  it("perdido não cobra as etapas puladas", () => {
    const r = validar("novo", "perdido", regras({ negoc: { camposObrigatorios: ["valor"], podeSerPulada: false } }));
    expect(r.ok).toBe(true);
  });

  it("ganho/perdido só sai com reabrir", () => {
    const r = validar("ganho", "proposta", new Map());
    expect(r).toMatchObject({ ok: false, codigo: "negocio_fechado" });
    expect(validar("perdido", "proposta", new Map(), VAZIO, { reabrir: true }).ok).toBe(true);
  });

  it("reabrir ainda cobra os campos da etapa alvo (mas não as puladas)", () => {
    const r = validar("perdido", "negoc", regras({ qualif: { camposObrigatorios: ["empresa"], podeSerPulada: false }, negoc: { camposObrigatorios: ["valor"] } }), VAZIO, { reabrir: true });
    expect(!r.ok && r.codigo === "campos_obrigatorios" && r.faltando.map((f) => f.campo)).toEqual(["valor"]);
  });

  it("flag de ignorar (importação/automação) passa e avisa que ignorou", () => {
    const r = validar("novo", "qualif", regras({ qualif: { camposObrigatorios: ["valor"] } }), VAZIO, { ignorarObrigatorios: true });
    expect(r).toMatchObject({ ok: true, ignorouObrigatorios: true });
  });

  it("a flag não abre negócio fechado", () => {
    expect(validar("ganho", "novo", new Map(), VAZIO, { ignorarObrigatorios: true }).ok).toBe(false);
  });

  it("mesma etapa não valida nada", () => {
    expect(validar("qualif", "qualif", regras({ qualif: { camposObrigatorios: ["valor"] } })).ok).toBe(true);
  });

  it("troca de funil olha só a alvo", () => {
    const outra = etapa("x1", 3, "open", "p2");
    const r = validarMudancaDeEtapa({
      etapas: [...ETAPAS, outra],
      regras: new Map([["x1", { ...regraPadrao("open"), camposObrigatorios: ["valor"] }], ["qualif", { ...regraPadrao("open"), camposObrigatorios: ["empresa"], podeSerPulada: false }]]),
      de: porId("novo"),
      para: outra,
      negocio: VAZIO,
      defs: [],
    });
    expect(!r.ok && r.codigo === "campos_obrigatorios" && r.faltando.map((f) => f.campo)).toEqual(["valor"]);
  });
});

describe("regras: registro e corpo", () => {
  it("sem registro: aberta = 7 dias, fechada = nunca", () => {
    expect(regraDoRegistro(null, "open").diasParado).toBe(7);
    expect(regraDoRegistro(null, "won").diasParado).toBeNull();
  });

  it("registro com rottingDays nulo = não apodrece; lixo no JSON cai fora", () => {
    const r = regraDoRegistro({ requiredFields: ["valor", "xyz", 3, "cf:consumo"], canBeSkipped: false, rottingDays: null, guidance: "Ligue" }, "open");
    expect(r).toEqual({ camposObrigatorios: ["valor", "cf:consumo"], podeSerPulada: false, diasParado: null, orientacao: "Ligue" });
  });

  it("corpo: campo de outro funil e prazo fora da faixa são recusados", () => {
    expect(lerRegraDoCorpo({ camposObrigatorios: ["cf:outro"] }, "open", ["consumo"]).ok).toBe(false);
    expect(lerRegraDoCorpo({ diasParado: 0 }, "open", []).ok).toBe(false);
    expect(lerRegraDoCorpo({ camposObrigatorios: ["valor", "cf:consumo"], diasParado: "10", podeSerPulada: false, orientacao: " Mande proposta " }, "open", ["consumo"])).toEqual({
      ok: true,
      regra: { camposObrigatorios: ["valor", "cf:consumo"], podeSerPulada: false, diasParado: 10, orientacao: "Mande proposta" },
    });
    expect(lerRegraDoCorpo({ diasParado: "" }, "open", [])).toMatchObject({ ok: true, regra: { diasParado: null } });
  });

  it("campoPreenchido: contato e produtos contam vínculos", () => {
    expect(campoPreenchido("contato", { ...VAZIO, contatos: 1 }, [])).toBe(true);
    expect(campoPreenchido("produtos", VAZIO, [])).toBe(false);
  });
});

describe("motivos de perda", () => {
  it("sem motivo → erro", () => {
    expect(resolverPerda(MOTIVOS_PADRAO, {})).toEqual({ ok: false, erro: "Escolha o motivo da perda." });
  });

  it("motivo padrão: id nulo, rótulo guardado", () => {
    expect(resolverPerda(MOTIVOS_PADRAO, { motivoId: "padrao:preco" })).toEqual({ ok: true, perda: { motivoId: null, rotulo: "Preço", nota: "" } });
  });

  it("Outro exige nota", () => {
    expect(resolverPerda(MOTIVOS_PADRAO, { motivoId: "padrao:outro" }).ok).toBe(false);
    expect(resolverPerda(MOTIVOS_PADRAO, { motivoId: "padrao:outro", nota: "Fechou a empresa" })).toEqual({
      ok: true,
      perda: { motivoId: null, rotulo: "Outro", nota: "Fechou a empresa" },
    });
  });

  it("motivo salvo: id vai junto; id desconhecido é recusado", () => {
    const salvos = [{ id: "m1", rotulo: "Preço", exigeNota: false }];
    expect(resolverPerda(salvos, { motivoId: "m1" })).toMatchObject({ ok: true, perda: { motivoId: "m1" } });
    expect(resolverPerda(salvos, { motivoId: "m9" }).ok).toBe(false);
  });

  it("texto livre (API antiga): casa com o rótulo sem acento; senão vira Outro com a nota", () => {
    expect(resolverPerda(MOTIVOS_PADRAO, { motivo: "preco" })).toMatchObject({ ok: true, perda: { rotulo: "Preço" } });
    expect(resolverPerda(MOTIVOS_PADRAO, { motivo: "Mudou de cidade" })).toEqual({ ok: true, perda: { motivoId: null, rotulo: "Outro", nota: "Mudou de cidade" } });
  });

  it("lista da configuração: sem nome, repetido e vazia são recusados", () => {
    expect(lerMotivosDoCorpo([]).ok).toBe(false);
    expect(lerMotivosDoCorpo([{ rotulo: "Preço" }, { rotulo: "preço " }]).ok).toBe(false);
    expect(lerMotivosDoCorpo([{ rotulo: " " }]).ok).toBe(false);
    expect(lerMotivosDoCorpo([{ id: "padrao:preco", rotulo: "Preço" }, { id: "m2", rotulo: "Outro", exigeNota: true }])).toEqual({
      ok: true,
      motivos: [{ rotulo: "Preço", exigeNota: false }, { id: "m2", rotulo: "Outro", exigeNota: true }],
    });
  });

  it("follow-up: 1 a 365 dias", () => {
    expect(diasDeFollowUp("7")).toBe(7);
    expect(diasDeFollowUp(0)).toBeNull();
    expect(diasDeFollowUp("")).toBeNull();
  });
});

describe("parado (rotting)", () => {
  const agora = new Date("2026-10-20T12:00:00Z");
  const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();

  it("prazo nulo = nunca para; etapa fechada nunca para", () => {
    expect(negocioParado({ stageSince: diasAtras(90) }, "open", null, agora)).toBe(false);
    expect(negocioParado({ stageSince: diasAtras(90) }, "won", 7, agora)).toBe(false);
    expect(prazoDeParado("open", undefined)).toBe(7);
  });

  it("conta da entrada na etapa quando não há atividade", () => {
    expect(negocioParado({ stageSince: diasAtras(8) }, "open", 7, agora)).toBe(true);
    expect(negocioParado({ stageSince: diasAtras(7) }, "open", 7, agora)).toBe(false);
  });

  it("atividade recente zera o relógio", () => {
    const n = { stageSince: diasAtras(30), lastActivityAt: diasAtras(2) };
    expect(diasSemAtividade(n, agora)).toBe(2);
    expect(negocioParado(n, "open", 7, agora)).toBe(false);
  });

  it("atividade antiga não volta o relógio para antes da entrada na etapa", () => {
    const n = { stageSince: diasAtras(3), lastActivityAt: diasAtras(40) };
    expect(diasSemAtividade(n, agora)).toBe(3);
  });

  it("negócio fechado não fica parado", () => {
    expect(negocioParado({ stageSince: diasAtras(30), closedAt: diasAtras(1) }, "open", 7, agora)).toBe(false);
  });
});

describe("modal Complete para mover", () => {
  const faltando = [
    { campo: "valor", rotulo: "Valor", etapaId: "qualif", etapa: "Qualificado" },
    { campo: "cf:consumo", rotulo: "Consumo", etapaId: "qualif", etapa: "Qualificado" },
    { campo: "produtos", rotulo: "Produtos", etapaId: "negoc", etapa: "Negociação" },
    { campo: "valor", rotulo: "Valor", etapaId: "negoc", etapa: "Negociação" },
    { campo: "cf:sumiu", rotulo: "Sumiu", etapaId: "negoc", etapa: "Negociação" },
  ];

  it("um campo por item, com as etapas que pedem; produtos só na ficha; campo apagado some", () => {
    const campos = montarCamposDoModal(faltando, DEFS);
    expect(campos.map((c) => [c.campo, c.tipo, c.etapas, c.soNaFicha])).toEqual([
      ["valor", "valor", ["Qualificado", "Negociação"], false],
      ["cf:consumo", "personalizado", ["Qualificado"], false],
      ["produtos", "produtos", ["Negociação"], true],
    ]);
  });

  it("valores → corpo do PATCH (vazio não vai)", () => {
    const campos = montarCamposDoModal(
      [
        { campo: "valor", rotulo: "Valor", etapaId: "a", etapa: "A" },
        { campo: "previsao", rotulo: "Previsão", etapaId: "a", etapa: "A" },
        { campo: "responsavel", rotulo: "Responsável", etapaId: "a", etapa: "A" },
        { campo: "contato", rotulo: "Contato", etapaId: "a", etapa: "A" },
        { campo: "empresa", rotulo: "Empresa", etapaId: "a", etapa: "A" },
        { campo: "cf:consumo", rotulo: "Consumo", etapaId: "a", etapa: "A" },
      ],
      DEFS
    );
    expect(corpoDoModal(campos, { valor: "1.500,00", previsao: "2026-11-30", responsavel: "u1", contato: "c1", empresa: "", "cf:consumo": "480" })).toEqual({
      amount: "1.500,00",
      expectedClosingAt: "2026-11-30",
      ownerId: "u1",
      addContactId: "c1",
      customFields: { consumo: "480" },
    });
  });
});
