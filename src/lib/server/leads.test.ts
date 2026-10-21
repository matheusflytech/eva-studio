import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  agent: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn(async () => undefined) }));
const webhooks = vi.hoisted(() => ({ emitirEventoDeContato: vi.fn() }));
vi.mock("@/lib/server/webhooks/emitir", () => webhooks);

import { marcarComoLead, serializarLead, salvarLeadExterno, resolverIdDoLead, atualizarLead, removerDosLeads } from "./leads";

beforeEach(() => vi.clearAllMocks());

describe("marcarComoLead", () => {
  it("só marca quem ainda não é lead (não rebaixa etapa)", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 0 });
    await marcarComoLead("c1", { agentId: "a1", channel: "instagram" });
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", leadStage: null },
      data: expect.objectContaining({ leadStage: "novo", leadAgentId: "a1", leadChannel: "instagram" }),
    });
    expect(webhooks.emitirEventoDeContato).not.toHaveBeenCalled();
  });

  it("virou lead agora: avisa os webhooks (lead.captured)", async () => {
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    db.contact.findUnique.mockResolvedValue({ orgId: "o1" });
    await marcarComoLead("c1", { agentId: "a1", channel: "instagram" });
    expect(webhooks.emitirEventoDeContato).toHaveBeenCalledWith("o1", "c1", "lead.captured");
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
        { id: "conv1", agentId: "a1", channel: "website", contactId: "site-123", agent: { name: "Vendedor" }, messages: [{ text: "oi", role: "contact" }] },
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
      lastMessage: { text: "oi", role: "contact" },
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
