import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => {
  const m = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    findUnique: vi.fn(async (): Promise<unknown> => null),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    updateMany: vi.fn(async () => ({ count: 0 })),
  });
  const d = {
    trashItem: m(),
    deletedRecord: m(),
    externalRef: m(),
    dealStageEvent: m(),
    dealItem: m(),
    dealAmountSetting: m(),
    dealLoss: m(),
    dealActivity: m(),
    deal: m(),
    contact: m(),
    company: m(),
    dealContact: m(),
    task: m(),
    note: m(),
    contactChannel: m(),
    contactTag: m(),
    sequenceEnrollment: m(),
    conversation: m(),
    pipelineStage: m(),
    profile: m(),
    product: m(),
    tag: m(),
    sequence: m(),
    agent: m(),
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(d));
  return d;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  _esquecerSondagens,
  apagarComLixeira,
  apagarParaSempre,
  limparLixeiraVencida,
  listarLixeira,
  restaurarDaLixeira,
} from "./lixeira";

const primeiroArgumento = (f: { mock: { calls: unknown[][] } }) => f.mock.calls[0]?.[0];
const AGORA = new Date("2026-10-20T12:00:00Z");
const QUEM = { id: "u1", nome: "Lu" };
const ausente = () => new Prisma.PrismaClientKnownRequestError("tabela não existe", { code: "P2021", clientVersion: "7" });

function todasAsTabelas() {
  for (const t of ["trashItem", "deletedRecord", "externalRef", "dealStageEvent", "dealItem", "dealAmountSetting", "dealLoss", "dealActivity"] as const) {
    db[t].findFirst.mockResolvedValue(null);
  }
}

const DEAL = {
  id: "d1",
  orgId: "o1",
  pipelineId: "p1",
  stageId: "s2",
  companyId: "co1",
  ownerId: "u1",
  name: "Acme",
  amountCents: 1000,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  stage: { name: "Proposta" },
  pipeline: { name: "Vendas" },
  company: { name: "Acme SA" },
};

beforeEach(() => {
  vi.clearAllMocks();
  _esquecerSondagens();
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(db));
  for (const t of Object.values(db)) {
    if (typeof t === "object" && "findMany" in t) {
      t.findMany.mockResolvedValue([]);
      t.findUnique.mockResolvedValue(null);
      t.deleteMany.mockResolvedValue({ count: 0 });
    }
  }
  todasAsTabelas();
  db.trashItem.create.mockResolvedValue({ id: "tr1" });
});

describe("apagar → lixeira", () => {
  it("negócio: a foto leva tudo o que a cascata apagaria, grava a lápide e só então apaga", async () => {
    db.deal.findFirst.mockResolvedValueOnce(DEAL);
    db.dealContact.findMany.mockResolvedValueOnce([{ contactId: "c1", role: "decisor" }]);
    db.task.findMany.mockResolvedValueOnce([{ id: "t1", dealId: "d1", text: "Ligar" }]);
    db.note.findMany.mockResolvedValueOnce([{ id: "n1", dealId: "d1", text: "Oi" }]);
    db.dealStageEvent.findMany.mockResolvedValueOnce([{ id: "e1", dealId: "d1", toStageId: "s2", ignorouObrigatorios: false }]);
    db.dealItem.findMany.mockResolvedValueOnce([{ id: "i1", dealId: "d1", quantity: "2" }]);
    db.dealAmountSetting.findUnique.mockResolvedValueOnce({ dealId: "d1", manualAmount: true });
    db.dealLoss.findUnique.mockResolvedValueOnce(null);
    db.dealActivity.findUnique.mockResolvedValueOnce({ dealId: "d1", lastActivityAt: AGORA });
    db.externalRef.findMany.mockResolvedValueOnce([{ source: "api", externalId: "erp-1" }]);

    const r = await apagarComLixeira({ orgId: "o1", entidade: "deal", id: "d1", quem: QUEM, seIndisponivel: "recusar", agora: AGORA });

    expect(r).toEqual({ lixeira: true, trashId: "tr1", expiresAt: new Date("2026-11-19T12:00:00Z"), aviso: null });
    expect(db.deal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1", orgId: "o1" } }));
    const data = db.trashItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: "o1", entity: "deal", entityId: "d1", name: "Acme", ownerId: "u1", deletedById: "u1", deletedByName: "Lu" });
    expect(data.detail).toBe("Vendas › Proposta · 1 tarefa · 1 nota · 1 produto · 1 contato");
    const foto = data.snapshot;
    expect(foto.registro).toMatchObject({ id: "d1", stageId: "s2", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(foto.registro.stage).toBeUndefined();
    expect(foto.contexto).toEqual({ etapa: "Proposta", funil: "Vendas", empresa: "Acme SA" });
    expect(foto.contatos).toEqual([{ contactId: "c1", role: "decisor" }]);
    expect(foto.tarefas).toHaveLength(1);
    expect(foto.notas).toHaveLength(1);
    expect(foto.eventos).toHaveLength(1);
    expect(foto.itens).toHaveLength(1);
    expect(foto.valorManual).toEqual({ dealId: "d1", manualAmount: true });
    expect(foto.atividade).toEqual({ dealId: "d1", lastActivityAt: AGORA.toISOString() });
    expect(foto.externos).toEqual([{ source: "api", externalId: "erp-1" }]);

    expect(db.deletedRecord.create).toHaveBeenCalledWith({ data: { orgId: "o1", entity: "deal", entityId: "d1", externalId: "erp-1" } });
    expect(db.externalRef.deleteMany).toHaveBeenCalledWith({ where: { orgId: "o1", entity: "deal", entityId: "d1" } });
    expect(db.deal.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(db.trashItem.create.mock.invocationCallOrder[0]).toBeLessThan(db.deal.delete.mock.invocationCallOrder[0]);
  });

  it("contato: canais, etiquetas, negócios, tarefas, notas, inscrições e conversas vão na foto", async () => {
    db.contact.findFirst.mockResolvedValueOnce({ id: "c1", orgId: "o1", name: "", phone: "5511999", ownerId: null, company: { name: "Acme" } });
    db.contactChannel.findMany.mockResolvedValueOnce([{ id: "ch1", contactId: "c1", agentId: "a1", channel: "whatsapp_qr", externalId: "5511999" }]);
    db.contactTag.findMany.mockResolvedValueOnce([{ tagId: "tag1", addedAt: AGORA }]);
    db.dealContact.findMany.mockResolvedValueOnce([{ dealId: "d1", role: "" }]);
    db.task.findMany.mockResolvedValueOnce([{ id: "t1", contactId: "c1" }]);
    db.note.findMany.mockResolvedValueOnce([{ id: "n1", contactId: "c1" }]);
    db.sequenceEnrollment.findMany.mockResolvedValueOnce([{ id: "en1", sequenceId: "s1", contactId: "c1" }]);
    db.conversation.findMany.mockResolvedValueOnce([{ id: "cv1" }]);

    await apagarComLixeira({ orgId: "o1", entidade: "contact", id: "c1", quem: QUEM, seIndisponivel: "recusar", agora: AGORA });

    const data = db.trashItem.create.mock.calls[0][0].data;
    expect(data.name).toBe("5511999");
    expect(data.snapshot).toMatchObject({
      entidade: "contact",
      contexto: { empresa: "Acme" },
      canais: [{ id: "ch1" }],
      etiquetas: [{ tagId: "tag1", addedAt: AGORA.toISOString() }],
      negocios: [{ dealId: "d1", role: "" }],
      tarefas: [{ id: "t1" }],
      notas: [{ id: "n1" }],
      inscricoes: [{ id: "en1" }],
      conversas: ["cv1"],
    });
    expect(db.conversation.findMany).toHaveBeenCalledWith({ where: { contactRecordId: "c1" }, select: { id: true } });
    expect(db.contact.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("empresa: guarda quem estava ligado (contatos e negócios ficam, sem empresa)", async () => {
    db.company.findFirst.mockResolvedValueOnce({ id: "co1", orgId: "o1", name: "Acme", ownerId: null });
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    db.deal.findMany.mockResolvedValueOnce([{ id: "d1" }, { id: "d2" }]);
    await apagarComLixeira({ orgId: "o1", entidade: "company", id: "co1", quem: QUEM, seIndisponivel: "recusar", agora: AGORA });
    expect(db.trashItem.create.mock.calls[0][0].data.snapshot).toMatchObject({ contatos: ["c1"], negocios: ["d1", "d2"] });
    expect(db.company.delete).toHaveBeenCalledWith({ where: { id: "co1" } });
  });

  it("registro de outra org: 404 e nada apagado", async () => {
    db.deal.findFirst.mockResolvedValueOnce(null);
    await expect(
      apagarComLixeira({ orgId: "o1", entidade: "deal", id: "d-outra", quem: QUEM, seIndisponivel: "recusar" })
    ).rejects.toMatchObject({ status: 404 });
    expect(db.trashItem.create).not.toHaveBeenCalled();
    expect(db.deal.delete).not.toHaveBeenCalled();
  });

  it("sem a tabela da lixeira: 'recusar' devolve 409 sem apagar; 'apagar' apaga de vez com aviso", async () => {
    db.trashItem.findFirst.mockRejectedValue(ausente());
    await expect(
      apagarComLixeira({ orgId: "o1", entidade: "deal", id: "d1", quem: QUEM, seIndisponivel: "recusar" })
    ).rejects.toMatchObject({ status: 409, codigo: "lixeira_indisponivel" });
    expect(db.deal.delete).not.toHaveBeenCalled();

    db.deal.findFirst.mockResolvedValueOnce(DEAL);
    const r = await apagarComLixeira({ orgId: "o1", entidade: "deal", id: "d1", quem: QUEM, seIndisponivel: "apagar" });
    expect(r.lixeira).toBe(false);
    expect(r.aviso).toContain("definitiva");
    expect(db.trashItem.create).not.toHaveBeenCalled();
    expect(db.deal.delete).toHaveBeenCalled();
  });

  it("sem a coluna nova do histórico de etapa: lê o histórico sem ela", async () => {
    db.dealStageEvent.findFirst.mockImplementation(async (a: { select?: Record<string, boolean> }) => {
      if (a?.select?.ignorouObrigatorios) throw new Prisma.PrismaClientKnownRequestError("coluna", { code: "P2022", clientVersion: "7" });
      return null;
    });
    db.deal.findFirst.mockResolvedValueOnce(DEAL);
    await apagarComLixeira({ orgId: "o1", entidade: "deal", id: "d1", quem: QUEM, seIndisponivel: "recusar" });
    const consulta = primeiroArgumento(db.dealStageEvent.findMany) as { select?: Record<string, unknown> };
    expect(consulta.select).toBeDefined();
    expect(consulta.select?.ignorouObrigatorios).toBeUndefined();
  });
});

function item(foto: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "tr1",
    orgId: "o1",
    entity: (foto as { entidade: string }).entidade,
    entityId: (foto as { registro: { id: string } }).registro.id,
    name: "X",
    snapshot: foto,
    expiresAt: new Date("2026-11-01T00:00:00Z"),
    ...extra,
  };
}

const FOTO_NEGOCIO = {
  versao: 1,
  entidade: "deal",
  registro: { id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2", companyId: "co1", ownerId: "u1", name: "Acme" },
  contexto: { etapa: "Proposta", funil: "Vendas", empresa: "Acme SA" },
  contatos: [{ contactId: "c1", role: "decisor" }],
  tarefas: [{ id: "t1", orgId: "o1", dealId: "d1", text: "Ligar" }],
  notas: [{ id: "n1", orgId: "o1", dealId: "d1", text: "Oi" }],
  eventos: [{ id: "e1", orgId: "o1", dealId: "d1", pipelineId: "p1", toStageId: "s2", ignorouObrigatorios: true }],
  itens: [],
  valorManual: null,
  perda: null,
  atividade: null,
  externos: [{ source: "api", externalId: "erp-1" }],
};

describe("restaurar", () => {
  it("negócio: recria com os mesmos ids, reata contato e remove a lápide e a foto", async () => {
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(FOTO_NEGOCIO));
    db.pipelineStage.findFirst.mockResolvedValueOnce({ id: "s2", pipelineId: "p1", type: "open", probability: 30 });
    db.company.findMany.mockResolvedValueOnce([{ id: "co1" }]);
    db.profile.findMany.mockResolvedValueOnce([{ id: "u1" }]);
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);

    const r = await restaurarDaLixeira("o1", "tr1", AGORA);

    expect(r).toEqual({ entidade: "deal", entityId: "d1", nome: "X", avisos: [] });
    expect(db.trashItem.findFirst).toHaveBeenLastCalledWith({ where: { id: "tr1", orgId: "o1" } });
    expect(db.deal.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "d1", stageId: "s2", companyId: "co1" })] });
    expect(db.dealContact.createMany).toHaveBeenCalledWith({ data: [{ dealId: "d1", contactId: "c1", role: "decisor" }], skipDuplicates: true });
    expect(db.task.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "t1" })] });
    expect(db.note.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "n1" })] });
    expect(db.dealStageEvent.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "e1", ignorouObrigatorios: true })] });
    expect(db.externalRef.createMany).toHaveBeenCalledWith({
      data: [{ orgId: "o1", entity: "deal", source: "api", externalId: "erp-1", entityId: "d1" }],
      skipDuplicates: true,
    });
    expect(db.deletedRecord.deleteMany).toHaveBeenCalledWith({ where: { orgId: "o1", entity: "deal", entityId: "d1" } });
    expect(db.trashItem.delete).toHaveBeenCalledWith({ where: { id: "tr1" } });
  });

  it("negócio com etapa e empresa apagadas: primeira etapa aberta, sem empresa, evento novo e avisos", async () => {
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(FOTO_NEGOCIO));
    db.pipelineStage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "s1", pipelineId: "p1", type: "open", probability: 10 });
    db.profile.findMany.mockResolvedValueOnce([{ id: "u1" }]);
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);

    const r = await restaurarDaLixeira("o1", "tr1", AGORA);

    expect(db.deal.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "d1", stageId: "s1", companyId: null, probability: 10 })] });
    const eventos = db.dealStageEvent.createMany.mock.calls[0][0].data;
    expect(eventos[1]).toMatchObject({ dealId: "d1", fromStageId: "s2", toStageId: "s1", origem: "usuario" });
    expect(r.avisos.join(" ")).toContain('A etapa "Proposta" não existe mais');
    expect(r.avisos.join(" ")).toContain('A empresa "Acme SA" não existe mais');
  });

  it("contato: recria canais livres e religa a conversa que ficou sem ficha", async () => {
    const foto = {
      versao: 1,
      entidade: "contact",
      registro: { id: "c1", orgId: "o1", companyId: null, ownerId: null, name: "Ana" },
      contexto: { empresa: "" },
      canais: [{ id: "ch1", contactId: "c1", agentId: "a1", channel: "whatsapp_qr", externalId: "5511" }],
      etiquetas: [{ tagId: "tag1", addedAt: "2026-01-01T00:00:00.000Z" }],
      negocios: [{ dealId: "d1", role: "" }],
      tarefas: [],
      notas: [],
      inscricoes: [],
      conversas: ["cv1"],
      externos: [],
    };
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(foto));
    db.tag.findMany.mockResolvedValueOnce([{ id: "tag1" }]);
    db.deal.findMany.mockResolvedValueOnce([{ id: "d1" }]);
    db.agent.findMany.mockResolvedValueOnce([{ id: "a1" }]);
    db.conversation.findMany.mockResolvedValueOnce([{ id: "cv1" }]);

    await restaurarDaLixeira("o1", "tr1", AGORA);

    expect(db.contact.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "c1" })] });
    expect(db.contactChannel.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "ch1" })], skipDuplicates: true });
    expect(db.contactTag.createMany).toHaveBeenCalledWith({ data: [{ contactId: "c1", tagId: "tag1", addedAt: "2026-01-01T00:00:00.000Z" }], skipDuplicates: true });
    expect(db.dealContact.createMany).toHaveBeenCalledWith({ data: [{ dealId: "d1", contactId: "c1", role: "" }], skipDuplicates: true });
    expect(db.conversation.findMany).toHaveBeenCalledWith({ where: { id: { in: ["cv1"] }, contactRecordId: null, agent: { orgId: "o1" } }, select: { id: true } });
    expect(db.conversation.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["cv1"] }, contactRecordId: null }, data: { contactRecordId: "c1" } });
  });

  it("empresa: religa contatos e negócios que continuam sem empresa", async () => {
    const foto = { versao: 1, entidade: "company", registro: { id: "co1", orgId: "o1", name: "Acme", ownerId: null }, contatos: ["c1"], negocios: ["d1"], externos: [] };
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(foto));
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    db.deal.findMany.mockResolvedValueOnce([{ id: "d1" }]);
    await restaurarDaLixeira("o1", "tr1", AGORA);
    expect(db.company.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: "co1" })] });
    expect(db.contact.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] }, orgId: "o1", companyId: null }, data: { companyId: "co1" } });
    expect(db.deal.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["d1"] }, orgId: "o1", companyId: null }, data: { companyId: "co1" } });
  });

  it("item de outra org: 404 (a consulta sempre filtra pela org de quem pede)", async () => {
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(restaurarDaLixeira("o1", "tr-de-outra", AGORA)).rejects.toMatchObject({ status: 404 });
    expect(db.trashItem.findFirst).toHaveBeenLastCalledWith({ where: { id: "tr-de-outra", orgId: "o1" } });
    expect(db.deal.createMany).not.toHaveBeenCalled();
  });

  it("vencido: 410, nada recriado", async () => {
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(FOTO_NEGOCIO, { expiresAt: new Date("2026-10-01T00:00:00Z") }));
    await expect(restaurarDaLixeira("o1", "tr1", AGORA)).rejects.toMatchObject({ status: 410 });
    expect(db.deal.createMany).not.toHaveBeenCalled();
  });

  it("já restaurado (mesmo id existe): 409", async () => {
    db.trashItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(item(FOTO_NEGOCIO));
    db.deal.findUnique.mockResolvedValueOnce({ id: "d1" });
    await expect(restaurarDaLixeira("o1", "tr1", AGORA)).rejects.toMatchObject({ status: 409, codigo: "ja_restaurado" });
  });
});

describe("listar, limpar, apagar para sempre", () => {
  it("lista só da org, sem vencidos, com escopo por responsável (e o que a pessoa apagou)", async () => {
    await listarLixeira("o1", { entidades: { deal: ["u1"], contact: null }, userId: "u1", busca: "acme", agora: AGORA });
    const where = (primeiroArgumento(db.trashItem.findMany) as { where: unknown }).where;
    expect(where).toEqual({
      orgId: "o1",
      expiresAt: { gt: AGORA },
      OR: [{ entity: "deal", OR: [{ ownerId: { in: ["u1"] } }, { deletedById: "u1" }] }, { entity: "contact" }],
      name: { contains: "acme", mode: "insensitive" },
    });
  });

  it("sem permissão para nenhuma entidade: lista vazia sem consultar", async () => {
    const r = await listarLixeira("o1", { entidades: {}, userId: "u1" });
    expect(r).toEqual({ disponivel: true, itens: [] });
    expect(db.trashItem.findMany).not.toHaveBeenCalled();
  });

  it("tabela ausente: disponível = false", async () => {
    db.trashItem.findFirst.mockRejectedValue(ausente());
    expect(await listarLixeira("o1", { entidades: { deal: null }, userId: "u1" })).toEqual({ disponivel: false, itens: [] });
    expect(await limparLixeiraVencida(AGORA)).toBe(0);
  });

  it("limpeza apaga as vencidas", async () => {
    db.trashItem.deleteMany.mockResolvedValueOnce({ count: 3 });
    expect(await limparLixeiraVencida(AGORA)).toBe(3);
    expect(db.trashItem.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: AGORA } } });
  });

  it("apagar para sempre filtra pela org", async () => {
    db.trashItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await apagarParaSempre("o1", "tr-outra")).toBe(false);
    expect(db.trashItem.deleteMany).toHaveBeenCalledWith({ where: { id: "tr-outra", orgId: "o1" } });
  });
});

