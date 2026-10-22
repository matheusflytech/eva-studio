import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { validarRascunhoSequencia, MAX_PASSOS, MAX_ESPERA_MIN, type CatalogoSequencia } from "./sequencias";

const cat: CatalogoSequencia = {
  tags: [{ id: "tag-1", name: "Orçamento pedido" }],
  segments: [{ id: "seg-1", name: "Clientes VIP" }],
  pipelines: [{ id: "p-b2b", name: "B2B", stages: [{ id: "st-novo", name: "Novo lead" }, { id: "st-prop", name: "Proposta" }] }],
  templates: [{ id: "tpl-1", name: "lembrete_proposta", bodyText: "Oi {nome}" }],
  canaisConectados: ["whatsapp_meta"],
};

const base = {
  name: "Follow-up de proposta",
  channel: "whatsapp_meta",
  trigger: "stage",
  triggerStageId: "st-prop",
  triggerStageDays: 0,
  steps: [
    { delayMinutes: 2880, text: "Oi {nome}, conseguiu ver a proposta?", templateId: "tpl-1" },
    { delayMinutes: 7200, text: "Passando para saber se ficou alguma dúvida.", templateId: "tpl-1" },
  ],
};

describe("validarRascunhoSequencia", () => {
  it("rascunho válido passa inteiro, com ordem e padrões", () => {
    const r = validarRascunhoSequencia(base, cat);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequencia).toMatchObject({
      trigger: "stage",
      triggerStageId: "st-prop",
      stopOnReply: true,
      allowReentry: false,
      triggerTagId: null,
    });
    expect(r.sequencia.steps.map((s) => [s.order, s.delayMinutes])).toEqual([[1, 2880], [2, 7200]]);
    expect(r.avisos).toEqual([]);
  });

  it("etapa de outra org é descartada e o gatilho vira manual com aviso", () => {
    const r = validarRascunhoSequencia({ ...base, triggerStageId: "etapa-de-outra-org" }, cat);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequencia.trigger).toBe("manual");
    expect(r.sequencia.triggerStageId).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/etapa do funil/);
  });

  it("aceita o nome da etiqueta no lugar do id", () => {
    const r = validarRascunhoSequencia({ ...base, trigger: "tag", triggerTagId: "orcamento pedido" }, cat);
    expect(r.ok && r.sequencia.triggerTagId).toBe("tag-1");
  });

  it("espera negativa vira imediato; espera enorme é limitada", () => {
    const r = validarRascunhoSequencia(
      { ...base, steps: [{ delayMinutes: -30, text: "a", templateId: "tpl-1" }, { delayMinutes: 10 ** 9, text: "b", templateId: "tpl-1" }] },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequencia.steps[0].delayMinutes).toBe(0);
    expect(r.sequencia.steps[1].delayMinutes).toBe(MAX_ESPERA_MIN);
    expect(r.avisos.some((a) => a.includes("negativa"))).toBe(true);
  });

  it("passo sem texto é descartado; modelo e etiqueta desconhecidos saem", () => {
    const r = validarRascunhoSequencia(
      {
        ...base,
        steps: [
          { delayMinutes: 60, text: "   " },
          "lixo",
          { delayMinutes: 60, text: "ok", templateId: "tpl-x", applyTagId: "tag-x" },
        ],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequencia.steps).toEqual([{ order: 1, delayMinutes: 60, text: "ok", templateId: null, applyTagId: null }]);
    expect(r.avisos.length).toBeGreaterThanOrEqual(4);
  });

  it(`limita a ${MAX_PASSOS} passos`, () => {
    const steps = Array.from({ length: 15 }, (_, i) => ({ delayMinutes: 60, text: `p${i}` }));
    const r = validarRascunhoSequencia({ ...base, channel: "telegram", steps }, cat);
    expect(r.ok && r.sequencia.steps.length).toBe(MAX_PASSOS);
  });

  it("canal e gatilho inválidos caem no padrão; canal não conectado gera aviso", () => {
    const r = validarRascunhoSequencia({ ...base, channel: "sms", trigger: "quando-quiser" }, cat);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequencia.channel).toBe("whatsapp_meta");
    expect(r.sequencia.trigger).toBe("manual");
    const r2 = validarRascunhoSequencia({ ...base, channel: "telegram" }, cat);
    expect(r2.ok && r2.avisos.join(" ")).toMatch(/Telegram ainda não está conectado/);
  });

  it("WhatsApp oficial: passo depois de 24h sem modelo gera aviso", () => {
    const r = validarRascunhoSequencia({ ...base, steps: [{ delayMinutes: 2880, text: "oi" }] }, cat);
    expect(r.ok && r.avisos.join(" ")).toMatch(/janela de 24h/);
  });

  it("modelo só vale no WhatsApp oficial", () => {
    const r = validarRascunhoSequencia({ ...base, channel: "telegram" }, cat);
    expect(r.ok && r.sequencia.steps.every((s) => s.templateId === null)).toBe(true);
  });

  it("dias parado negativo vira 0", () => {
    const r = validarRascunhoSequencia({ ...base, triggerStageDays: -3 }, cat);
    expect(r.ok && r.sequencia.triggerStageDays).toBe(0);
  });

  it("sem nenhum passo utilizável ou formato errado: recusa", () => {
    expect(validarRascunhoSequencia({ ...base, steps: [] }, cat).ok).toBe(false);
    expect(validarRascunhoSequencia([], cat).ok).toBe(false);
    expect(validarRascunhoSequencia("texto", cat).ok).toBe(false);
  });
});
