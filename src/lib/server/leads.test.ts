import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  agent: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
  dealContact: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn(async () => undefined) }));
const barramento = vi.hoisted(() => ({ publicarEvento: vi.fn() }));
vi.mock("@/lib/server/eventos/barramento", () => barramento);
const crm = vi.hoisted(() => ({ createDeal: vi.fn() }));
vi.mock("@/lib/server/crm", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/crm")>()), createDeal: crm.createDeal }));

import { ErroDeCrm } from "@/lib/server/crm";
import { marcarComoLead, serializarLead, salvarLeadExterno, resolverIdDoLead, atualizarLead, removerDosLeads, converterLeadEmNegocio } from "./leads";

beforeEach(() => vi.clearAllMocks());

describe("marcarComoLead", () => {
  it("só marca quem ainda não é lead (não rebaixa etapa)", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 0 });
    await marcarComoLead("c1", { agentId: "a1", channel: "instagram" });
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", leadStage: null },
      data: expect.objectContaining({ leadStage: "novo", leadAgentId: "a1", leadChannel: "instagram" }),
    });
    expect(barramento.publicarEvento).not.toHaveBeenCalled();
  });

  it("virou lead agora: publica lead.captured", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    db.contact.findUnique.mockResolvedValue({ orgId: "o1" });
    await marcarComoLead("c1", { agentId: "a1", channel: "instagram" });
    expect(barramento.publicarEvento).toHaveBeenCalledWith({
      orgId: "o1",
      tipo: "lead.captured",
      objeto: "contact",
      objetoId: "c1",
      dados: { agent_id: "a1", channel: "instagram" },
    });
  });
});

describe("serializarLead", () => {
  it("monta nome/e-mail/telefone, campos e a última conversa", () => {
    const lead = serializarLead({
      id: "c1",
      name: "Ana",
      email: "ana@x.com",
      phone: "+5511987654321",
      customFields: { consumo: 300 },
      leadStage: "qualificado",
      leadAt: new Date("2026-10-19T10:00:00Z"),
      leadAgentId: "a1",
      leadChannel: "website",
      updatedAt: new Date("2026-10-19T11:00:00Z"),
      conversations: [
        { id: "conv1", agentId: "a1", channel: "website", contactId: "site-123", agent: { name: "Vendedor" }, messages: [{ text: "oi", role: "contact", createdAt: new Date("2026-10-19T10:30:00Z") }] },
      ],
    });
    expect(lead).toMatchObject({
      id: "c1",
      name: "Ana",
      stage: "qualificado",
      agentId: "a1",
      agentName: "Vendedor",
      channel: "website",
      externalId: "site-123",
      conversationId: "conv1",
      fields: { nome: "Ana", email: "ana@x.com", telefone: "+5511987654321", consumo: 300 },
      lastMessage: { text: "oi", role: "contact", createdAt: "2026-10-19T10:30:00.000Z" },
    });
  });
});

describe("salvarLeadExterno", () => {
  beforeEach(() => {
    db.agent.findFirst.mockResolvedValue({ id: "a1" });
    db.contact.findFirst.mockResolvedValue(null);
    db.contact.findMany.mockResolvedValue([]);
    db.contact.create.mockImplementation(async ({ data }) => ({ id: "novo", ...data }));
  });

  it("recusa e-mail e telefone inválidos com erro por campo", async () => {
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { email: "ana@", telefone: "123" } }, "api");
    expect(r).toEqual({ error: "Dados inválidos.", status: 400, fieldErrors: { email: "E-mail inválido.", telefone: "Telefone inválido." } });
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("agente de outra org: erro", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect(await salvarLeadExterno("o1", { agentId: "x", fields: {} }, "api")).toEqual({ error: "agentId não encontrado nessa organização.", status: 404 });
  });

  it("cria contato-lead normalizado; resto vira campo livre", async () => {
    const r = await salvarLeadExterno(
      "o1",
      { agentId: "a1", fields: { nome: " Ana ", email: "ANA@X.COM", telefone: "(11) 98765-4321", origem: "feira" }, stage: "contatado" },
      "api"
    );
    expect("contactId" in r && r.contactId).toBe("novo");
    expect(db.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "o1",
        name: "Ana",
        email: "ana@x.com",
        phone: "+5511987654321",
        customFields: { origem: "feira" },
        source: "api",
        leadStage: "contatado",
        leadAgentId: "a1",
      }),
    });
  });

  it("mesmo e-mail na org: atualiza a ficha em vez de duplicar", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c9", name: "Ana", email: "ana@x.com", phone: "", customFields: {}, leadStage: null });
    db.contact.update.mockResolvedValue({ id: "c9" });
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { email: "ana@x.com" } }, "api");
    expect("contactId" in r && r.contactId).toBe("c9");
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("etapa inválida", async () => {
    expect(await salvarLeadExterno("o1", { agentId: "a1", fields: {}, stage: "xyz" }, "api")).toEqual({
      error: "stage precisa ser um de: novo, contatado, qualificado, ganho, perdido.",
      status: 400,
    });
  });

  it("agentId ou fields com tipo errado: 400 sem tocar no banco", async () => {
    expect(await salvarLeadExterno("o1", { agentId: 123, fields: {} }, "api")).toMatchObject({ status: 400 });
    expect(await salvarLeadExterno("o1", { agentId: "a1", fields: ["x"] }, "api")).toMatchObject({ status: 400 });
    expect(db.agent.findFirst).not.toHaveBeenCalled();
  });

  it("dedupe por telefone compara o número inteiro: DDD diferente vira outro contato", async () => {
    // Contato já existente com 21977776666, gravado em formatos variados.
    db.contact.findMany.mockResolvedValue([
      { id: "rj", phone: "+5521977776666", name: "", email: "", customFields: {}, leadStage: null },
      { id: "rj2", phone: "21 97777-6666", name: "", email: "", customFields: {}, leadStage: null },
    ]);
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { telefone: "11977776666" } }, "api");
    expect("contactId" in r && r.contactId).toBe("novo");
    expect(db.contact.update).not.toHaveBeenCalled();
    expect(db.contact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "+5511977776666" }) });
  });

  it("dedupe por telefone acha o mesmo número em outro formato", async () => {
    db.contact.findMany.mockResolvedValue([
      { id: "rj", phone: "+5521977776666", name: "", email: "", customFields: {}, leadStage: null },
      { id: "sp", phone: "5511977776666", name: "Ana", email: "", customFields: {}, leadStage: null },
    ]);
    db.contact.update.mockResolvedValue({ id: "sp" });
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { telefone: "(11) 97777-6666" } }, "api");
    expect("contactId" in r && r.contactId).toBe("sp");
    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1", phone: { contains: "6666" } } }));
    expect(db.contact.create).not.toHaveBeenCalled();
  });
});

describe("atualizarLead", () => {
  it("muda a etapa", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", customFields: {}, leadStage: "novo" });
    const r = await atualizarLead("o1", "c1", { stage: "ganho" });
    expect(r).toEqual({ contactId: "c1" });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { leadStage: "ganho" } });
  });

  it("etapa inválida ou nada para mudar: 400", async () => {
    expect(await atualizarLead("o1", "c1", { stage: "xyz" })).toMatchObject({ status: 400 });
    expect(await atualizarLead("o1", "c1", {})).toMatchObject({ status: 400 });
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("mescla fields validados (e-mail na coluna, resto em customFields)", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", customFields: { a: 1 }, leadStage: "novo" });
    await atualizarLead("o1", "c1", { fields: { email: "ANA@X.COM", b: 2 } });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { email: "ana@x.com", customFields: { a: 1, b: 2 } } });
  });

  it("e-mail inválido: 400 com fieldErrors", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", customFields: {}, leadStage: "novo" });
    expect(await atualizarLead("o1", "c1", { fields: { email: "ana@" } })).toEqual({
      error: "Dados inválidos.",
      status: 400,
      fieldErrors: { email: "E-mail inválido." },
    });
  });

  it("não é lead da org: 404", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(await atualizarLead("o1", "c1", { stage: "ganho" })).toMatchObject({ status: 404 });
  });
});

describe("removerDosLeads", () => {
  it("só limpa leadStage (não apaga o contato)", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    expect(await removerDosLeads("o1", "c1")).toBe(true);
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", orgId: "o1", leadStage: { not: null } },
      data: { leadStage: null },
    });
  });
  it("não achou: false", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 0 });
    expect(await removerDosLeads("o1", "c1")).toBe(false);
  });
});

describe("resolverIdDoLead", () => {
  it("id de contato da org", async () => {
    db.contact.findFirst.mockResolvedValueOnce({ id: "c1" });
    expect(await resolverIdDoLead("o1", "c1")).toBe("c1");
  });
  it("id antigo (conversa) resolve para o contato", async () => {
    db.contact.findFirst.mockResolvedValueOnce(null);
    db.conversation.findFirst.mockResolvedValueOnce({ contactRecordId: "c7" });
    expect(await resolverIdDoLead("o1", "conv-antiga")).toBe("c7");
    expect(db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conv-antiga", agent: { orgId: "o1" } } })
    );
  });
  it("nada encontrado", async () => {
    db.contact.findFirst.mockResolvedValueOnce(null);
    db.conversation.findFirst.mockResolvedValueOnce(null);
    expect(await resolverIdDoLead("o1", "zzz")).toBeNull();
  });
});

describe("converterLeadEmNegocio", () => {
  const lead = { id: "c1", name: "Ana", email: "ana@x.com", phone: "5511999990001" };
  beforeEach(() => {
    db.contact.findFirst.mockResolvedValue(lead);
    db.dealContact.findFirst.mockResolvedValue(null);
    db.contact.update.mockResolvedValue({});
    crm.createDeal.mockResolvedValue({ id: "d1" });
  });

  it("cria o negócio ligado ao contato, com o autor como responsável, e marca o lead como ganho", async () => {
    expect(await converterLeadEmNegocio("o1", "c1", { userId: "u1" })).toEqual({ dealId: "d1" });
    expect(db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", orgId: "o1", leadStage: { not: null } } }));
    expect(crm.createDeal).toHaveBeenCalledWith({ orgId: "o1", name: "Ana", contactId: "c1", ownerId: "u1" });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { leadStage: "ganho" } });
  });

  it("sem nome, o negócio leva o telefone; sem nada, \"Novo lead\"", async () => {
    db.contact.findFirst.mockResolvedValue({ ...lead, name: "  " });
    await converterLeadEmNegocio("o1", "c1", { userId: "u1" });
    expect(crm.createDeal.mock.calls[0][0].name).toContain("99999-0001");
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "", email: "", phone: "" });
    await converterLeadEmNegocio("o1", "c1", { userId: "u1" });
    expect(crm.createDeal.mock.calls[1][0].name).toBe("Novo lead");
  });

  it("já tem negócio aberto: não cria outro, devolve 409 com o existente e marca o lead", async () => {
    db.dealContact.findFirst.mockResolvedValue({ dealId: "d9" });
    expect(await converterLeadEmNegocio("o1", "c1", { userId: "u1" })).toEqual({ error: "Esse lead já tem um negócio aberto.", status: 409, dealId: "d9" });
    expect(crm.createDeal).not.toHaveBeenCalled();
    expect(db.dealContact.findFirst.mock.calls[0][0].where).toEqual({ contactId: "c1", deal: { orgId: "o1", closedAt: null } });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { leadStage: "ganho" } });
  });

  it("lead de outra org ou que não é lead: 404, nada criado", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(await converterLeadEmNegocio("o1", "c1", { userId: "u1" })).toEqual({ error: "Lead não encontrado.", status: 404 });
    expect(crm.createDeal).not.toHaveBeenCalled();
  });

  it("falha do CRM (funil sem etapas): devolve o erro e o lead continua como estava", async () => {
    crm.createDeal.mockRejectedValue(new ErroDeCrm("Funil sem etapas configuradas."));
    expect(await converterLeadEmNegocio("o1", "c1", { userId: "u1" })).toEqual({ error: "Funil sem etapas configuradas.", status: 400 });
    expect(db.contact.update).not.toHaveBeenCalled();
  });
});
