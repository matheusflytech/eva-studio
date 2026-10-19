import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  metaConnection: { findMany: vi.fn() },
  messageTemplate: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { lerEventoDeTemplate, aplicarEventoDeTemplate, CAMPOS_DE_TEMPLATE } from "./meta-template-eventos";

describe("lerEventoDeTemplate", () => {
  it("aprovação", () => {
    expect(
      lerEventoDeTemplate("message_template_status_update", {
        event: "APPROVED",
        message_template_id: 12345,
        message_template_name: "boas_vindas",
        message_template_language: "pt_BR",
        reason: "NONE",
      })
    ).toEqual({
      tipo: "status",
      metaTemplateId: "12345",
      nome: "boas_vindas",
      idioma: "pt_BR",
      status: "APPROVED",
      motivo: null,
    });
  });

  it("recusa com motivo", () => {
    const e = lerEventoDeTemplate("message_template_status_update", {
      event: "REJECTED",
      message_template_id: "99",
      message_template_name: "promo",
      message_template_language: "pt_BR",
      reason: "INVALID_FORMAT",
    });
    expect(e).toMatchObject({ tipo: "status", status: "REJECTED", motivo: "INVALID_FORMAT" });
  });

  it("motivo detalhado de outra_info quando existe", () => {
    const e = lerEventoDeTemplate("message_template_status_update", {
      event: "PAUSED",
      message_template_id: "99",
      message_template_name: "promo",
      message_template_language: "pt_BR",
      other_info: { title: "FIRST_PAUSE", description: "Qualidade baixa." },
    });
    expect(e).toMatchObject({ status: "PAUSED", motivo: "FIRST_PAUSE: Qualidade baixa." });
  });

  it("mudança de categoria", () => {
    expect(
      lerEventoDeTemplate("template_category_update", {
        message_template_id: 7,
        message_template_name: "aviso",
        message_template_language: "pt_BR",
        previous_category: "UTILITY",
        new_category: "MARKETING",
      })
    ).toEqual({ tipo: "categoria", metaTemplateId: "7", nome: "aviso", idioma: "pt_BR", categoria: "MARKETING" });
  });

  it("campo desconhecido ou corpo malformado → null", () => {
    expect(lerEventoDeTemplate("messages", { event: "APPROVED" })).toBeNull();
    expect(lerEventoDeTemplate("message_template_status_update", null)).toBeNull();
    expect(lerEventoDeTemplate("message_template_status_update", { event: "APPROVED" })).toBeNull();
    expect(lerEventoDeTemplate("template_category_update", { message_template_id: "1" })).toBeNull();
  });

  it("lista de campos tratados", () => {
    expect(CAMPOS_DE_TEMPLATE.has("message_template_status_update")).toBe(true);
    expect(CAMPOS_DE_TEMPLATE.has("template_category_update")).toBe(true);
  });
});

describe("aplicarEventoDeTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.metaConnection.findMany.mockResolvedValue([{ agentId: "a1" }, { agentId: "a2" }]);
  });

  it("acha pelo id da Meta entre os agentes daquele WABA", async () => {
    db.messageTemplate.updateMany.mockResolvedValue({ count: 1 });
    const n = await aplicarEventoDeTemplate("waba1", {
      tipo: "status",
      metaTemplateId: "99",
      nome: "promo",
      idioma: "pt_BR",
      status: "REJECTED",
      motivo: "INVALID_FORMAT",
    });
    expect(n).toBe(1);
    expect(db.metaConnection.findMany).toHaveBeenCalledWith({ where: { wabaId: "waba1" }, select: { agentId: true } });
    const arg = db.messageTemplate.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ agentId: { in: ["a1", "a2"] }, metaTemplateId: "99" });
    expect(arg.data).toMatchObject({ metaStatus: "REJECTED", metaStatusReason: "INVALID_FORMAT" });
    expect(arg.data.metaStatusAt).toBeInstanceOf(Date);
  });

  it("sem par pelo id, cai para nome + idioma e guarda o id", async () => {
    db.messageTemplate.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 2 });
    const n = await aplicarEventoDeTemplate("waba1", {
      tipo: "status",
      metaTemplateId: "99",
      nome: "promo",
      idioma: "pt_BR",
      status: "APPROVED",
      motivo: null,
    });
    expect(n).toBe(2);
    const arg = db.messageTemplate.updateMany.mock.calls[1][0];
    expect(arg.where).toEqual({ agentId: { in: ["a1", "a2"] }, metaTemplateName: "promo", metaLanguageCode: "pt_BR" });
    expect(arg.data).toMatchObject({ metaTemplateId: "99", metaStatus: "APPROVED", metaStatusReason: null });
  });

  it("categoria vai em minúsculas, que é como o app guarda", async () => {
    db.messageTemplate.updateMany.mockResolvedValue({ count: 1 });
    await aplicarEventoDeTemplate("waba1", {
      tipo: "categoria",
      metaTemplateId: "7",
      nome: "aviso",
      idioma: "pt_BR",
      categoria: "MARKETING",
    });
    expect(db.messageTemplate.updateMany.mock.calls[0][0].data).toEqual({ category: "marketing" });
  });

  it("WABA desconhecido não grava nada", async () => {
    db.metaConnection.findMany.mockResolvedValue([]);
    const n = await aplicarEventoDeTemplate("outro", {
      tipo: "categoria",
      metaTemplateId: "7",
      nome: "aviso",
      idioma: "pt_BR",
      categoria: "UTILITY",
    });
    expect(n).toBe(0);
    expect(db.messageTemplate.updateMany).not.toHaveBeenCalled();
  });
});
