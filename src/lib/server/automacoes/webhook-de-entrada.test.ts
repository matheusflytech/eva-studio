import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  automacao: { findUnique: vi.fn() },
  contact: { findFirst: vi.fn() },
  deal: { findFirst: vi.fn() },
  company: { findFirst: vi.fn() },
}));
const contatos = vi.hoisted(() => ({ acharContatoExistente: vi.fn(), lerDadosDeContato: vi.fn(async (_o: string, c: unknown) => c), upsertContato: vi.fn() }));
const crm = vi.hoisted(() => ({ findOpenDealForContact: vi.fn() }));
const insc = vi.hoisted(() => ({ inscrever: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/api-v1/contatos", () => contatos);
vi.mock("@/lib/server/crm", () => crm);
vi.mock("./inscricao", () => insc);

import { receberWebhook } from "./webhook-de-entrada";
import { ErroApi } from "@/lib/server/api-v1/http";

const TOKEN = "a".repeat(32);
const automacao = (objeto: string, extra: Record<string, unknown> = {}) => ({
  id: "a1",
  orgId: "o1",
  objeto,
  status: "ativa",
  versaoPublicadaId: "v1",
  reinscricao: "sempre",
  reinscricaoHoras: null,
  versaoPublicada: { definicao: { gatilho: { tipo: `${objeto}.webhook`, config: { token: TOKEN } } } },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  insc.inscrever.mockResolvedValue({ inscrita: true, execucaoId: "x1" });
});

describe("receberWebhook", () => {
  it("token errado, automação sem webhook ou inexistente: mesma resposta 404", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("contact"));
    expect((await receberWebhook("a1", "b".repeat(32), {})).status).toBe(404);
    db.automacao.findUnique.mockResolvedValue(automacao("contact", { versaoPublicada: { definicao: { gatilho: { tipo: "contact.created", config: { token: TOKEN } } } } }));
    expect((await receberWebhook("a1", TOKEN, {})).status).toBe(404);
    db.automacao.findUnique.mockResolvedValue(null);
    expect((await receberWebhook("a1", TOKEN, {})).corpo).toEqual({ error: { code: "invalid_url", message: "URL inválida ou trocada." } });
    expect(insc.inscrever).not.toHaveBeenCalled();
  });

  it("desligada: 409", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("contact", { status: "pausada" }));
    expect((await receberWebhook("a1", TOKEN, { email: "a@b.com" })).status).toBe(409);
  });

  it("contato achado pelo e-mail: inscreve com o corpo no gatilho e a chave de idempotência", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("contact"));
    contatos.acharContatoExistente.mockResolvedValue({ id: "c1", matchedBy: "email" });
    const r = await receberWebhook("a1", TOKEN, { email: "ana@x.com", plano: "anual" }, "pedido-9");
    expect(r).toMatchObject({ status: 202, executar: "x1", corpo: { data: { enrolled: true, record_id: "c1" } } });
    expect(insc.inscrever).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "c1", {
      origem: "webhook:pedido-9",
      gatilho: { email: "ana@x.com", plano: "anual", tipo: "webhook" },
    });
    expect(contatos.upsertContato).not.toHaveBeenCalled();
  });

  it("contato novo: cria pelo e-mail/telefone e nome", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("contact"));
    contatos.acharContatoExistente.mockResolvedValue(null);
    contatos.upsertContato.mockResolvedValue({ id: "c2", result: "created" });
    const r = await receberWebhook("a1", TOKEN, { nome: "Ana", phone: "5511999990000" });
    expect(contatos.lerDadosDeContato).toHaveBeenCalledWith("o1", { name: "Ana", phone: "5511999990000" });
    expect(r.corpo).toMatchObject({ data: { record_id: "c2" } });
  });

  it("negócio: o aberto do contato; sem negócio, 404 explicando o que mandar", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("deal"));
    contatos.acharContatoExistente.mockResolvedValue({ id: "c1", matchedBy: "phone" });
    crm.findOpenDealForContact.mockResolvedValue({ id: "d1" });
    expect((await receberWebhook("a1", TOKEN, { phone: "5511" })).corpo).toMatchObject({ data: { record_id: "d1" } });
    crm.findOpenDealForContact.mockResolvedValue(null);
    const r = await receberWebhook("a1", TOKEN, { phone: "5511" });
    expect(r.status).toBe(404);
    expect(r.corpo).toMatchObject({ error: { code: "record_not_found" } });
  });

  it("dois contatos com o mesmo e-mail: devolve o 409 do CRM, sem inscrever", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("contact"));
    contatos.acharContatoExistente.mockRejectedValue(new ErroApi(409, "ambiguous_match", "Mais de um contato com esse e-mail.", { details: { ids: ["c1", "c2"] } }));
    const r = await receberWebhook("a1", TOKEN, { email: "a@b.com" });
    expect(r).toEqual({ status: 409, corpo: { error: { code: "ambiguous_match", message: "Mais de um contato com esse e-mail.", details: { ids: ["c1", "c2"] } } } });
    expect(insc.inscrever).not.toHaveBeenCalled();
  });

  it("já estava na automação: 200 com o motivo", async () => {
    db.automacao.findUnique.mockResolvedValue(automacao("company"));
    db.company.findFirst.mockResolvedValue({ id: "e1" });
    insc.inscrever.mockResolvedValue({ inscrita: false, motivo: "já está nesta automação" });
    expect(await receberWebhook("a1", TOKEN, { id: "e1" })).toEqual({ status: 200, corpo: { data: { enrolled: false, reason: "já está nesta automação", record_id: "e1" } } });
  });
});
