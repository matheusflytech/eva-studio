import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipelineStage: { findUnique: vi.fn(), findMany: vi.fn() },
  pipeline: { findFirst: vi.fn() },
  deal: { update: vi.fn(), findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  dealStageEvent: { createMany: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
  dealContact: { count: vi.fn(async () => 0) },
  dealItem: { count: vi.fn(async () => 0) },
  pipelineStageRule: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  pipelineLostReason: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  dealLoss: { upsert: vi.fn(), deleteMany: vi.fn() },
  task: { create: vi.fn(async () => ({ id: "t1", type: "ligar" })) },
  $executeRaw: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/eventos/barramento", () => ({ publicarEvento: vi.fn() }));
vi.mock("@/lib/server/eventos/alteracoes", () => ({ fotoDoRegistro: vi.fn(), publicarAlteracao: vi.fn() }));

import { ErroDaMudanca, createDeal, moveDealStage } from "./crm";

const ETAPAS = [
  { id: "s1", name: "Novo", type: "open", position: 0, pipelineId: "p1", probability: 10 },
  { id: "s2", name: "Proposta", type: "open", position: 1, pipelineId: "p1", probability: 40 },
  { id: "s3", name: "Negociação", type: "open", position: 2, pipelineId: "p1", probability: 70 },
  { id: "sw", name: "Ganho", type: "won", position: 3, pipelineId: "p1", probability: 100 },
  { id: "sl", name: "Perdido", type: "lost", position: 4, pipelineId: "p1", probability: 0 },
];
const DEAL = { id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s1", amountCents: 0, expectedClosingAt: null, ownerId: null, companyId: null, customFields: {} };

beforeEach(() => {
  vi.clearAllMocks();
  db.pipelineStage.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ETAPAS.find((e) => e.id === where.id) ?? null);
  db.pipelineStage.findMany.mockResolvedValue(ETAPAS);
  db.deal.findUnique.mockResolvedValue(DEAL);
  db.deal.update.mockImplementation(async ({ data }: { data: { stageId: string } }) => ({ ...DEAL, ...data }));
  db.deal.aggregate.mockResolvedValue({ _min: { position: 0 } });
  db.pipelineStageRule.findMany.mockResolvedValue([]);
  db.pipelineLostReason.findMany.mockResolvedValue([]);
});

describe("moveDealStage grava o histórico", () => {
  it("registra de onde veio, para onde foi e quem moveu", async () => {
    await moveDealStage("d1", "s2", { origem: "fluxo" });
    expect(db.dealStageEvent.createMany).toHaveBeenCalledWith({
      data: [{ orgId: "o1", dealId: "d1", pipelineId: "p1", fromStageId: "s1", toStageId: "s2", origem: "fluxo" }],
    });
  });

  it("mesma etapa: não grava nada", async () => {
    await moveDealStage("d1", "s1");
    expect(db.deal.update).not.toHaveBeenCalled();
    expect(db.dealStageEvent.createMany).not.toHaveBeenCalled();
  });

  it("origem padrão é usuario", async () => {
    await moveDealStage("d1", "s2");
    expect(db.dealStageEvent.createMany.mock.calls[0][0].data[0].origem).toBe("usuario");
  });

  it("falha ao gravar o histórico não desfaz o movimento", async () => {
    db.dealStageEvent.createMany.mockRejectedValue(new Error("tabela não existe"));
    await expect(moveDealStage("d1", "s2")).resolves.toMatchObject({ stageId: "s2" });
  });

  it("banco sem a coluna da flag: grava o evento sem ela", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([{ stageId: "s2", requiredFields: ["valor"], canBeSkipped: true, rottingDays: 7, guidance: "" }]);
    db.dealStageEvent.createMany.mockRejectedValue(new Error('column "ignorouObrigatorios" does not exist'));
    await moveDealStage("d1", "s2", { origem: "importacao", ignorarObrigatorios: true });
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});

describe("moveDealStage valida as regras da etapa", () => {
  const regraDaProposta = { stageId: "s2", requiredFields: ["valor", "previsao"], canBeSkipped: false, rottingDays: 7, guidance: "" };

  it("faltou campo da etapa alvo: 422 com a lista exata, nada gravado", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([regraDaProposta]);
    const erro = await moveDealStage("d1", "s2").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDaMudanca);
    expect(erro.status).toBe(422);
    expect(erro.faltando.map((f: { campo: string }) => f.campo)).toEqual(["valor", "previsao"]);
    expect(db.deal.update).not.toHaveBeenCalled();
    expect(db.dealStageEvent.createMany).not.toHaveBeenCalled();
  });

  it("pular etapa que não pode ser pulada cobra os campos dela", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([regraDaProposta]);
    await expect(moveDealStage("d1", "s3")).rejects.toMatchObject({ codigo: "campos_obrigatorios" });
  });

  it("o que a mesma ação grava (pendente) conta", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([regraDaProposta]);
    await expect(moveDealStage("d1", "s2", { pendente: { amountCents: 100, expectedClosingAt: new Date() } })).resolves.toMatchObject({ stageId: "s2" });
  });

  it("simular não grava", async () => {
    await expect(moveDealStage("d1", "s2", { simular: true })).resolves.toBeNull();
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("flag explícita de importação passa e fica registrada no evento", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([regraDaProposta]);
    await moveDealStage("d1", "s2", { origem: "importacao", ignorarObrigatorios: true });
    expect(db.dealStageEvent.createMany.mock.calls[0][0].data[0]).toMatchObject({ origem: "importacao", ignorouObrigatorios: true });
  });

  it("negócio ganho só sai com reabrir (409)", async () => {
    db.deal.findUnique.mockResolvedValue({ ...DEAL, stageId: "sw" });
    await expect(moveDealStage("d1", "s2")).rejects.toMatchObject({ status: 409, codigo: "negocio_fechado" });
    await expect(moveDealStage("d1", "s2", { reabrir: true })).resolves.toMatchObject({ stageId: "s2" });
  });

  it("perdido exige motivo; grava o rótulo em lostReason e a perda estruturada", async () => {
    await expect(moveDealStage("d1", "sl")).rejects.toMatchObject({ codigo: "motivo_obrigatorio" });
    await moveDealStage("d1", "sl", { perda: { motivoId: "padrao:preco" } });
    expect(db.deal.update.mock.calls[0][0].data.lostReason).toBe("Preço");
    expect(db.dealLoss.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ dealId: "d1", reasonId: null, reasonLabel: "Preço" }) }));
  });

  it("Outro exige nota; follow-up cria a tarefa", async () => {
    await expect(moveDealStage("d1", "sl", { perda: { motivoId: "padrao:outro" } })).rejects.toMatchObject({ codigo: "motivo_obrigatorio" });
    await moveDealStage("d1", "sl", { perda: { motivoId: "padrao:outro", nota: "Fechou as portas" }, followUpDias: 30 });
    expect(db.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ dealId: "d1", text: "Retomar contato (perdido: Outro)" }) });
  });

  it("reabrir um perdido apaga a perda estruturada", async () => {
    db.deal.findUnique.mockResolvedValue({ ...DEAL, stageId: "sl" });
    await moveDealStage("d1", "s2", { reabrir: true });
    expect(db.dealLoss.deleteMany).toHaveBeenCalledWith({ where: { dealId: "d1" } });
    expect(db.deal.update.mock.calls[0][0].data.lostReason).toBe("");
  });

  it("sem as tabelas novas: regra padrão (nada obrigatório) e motivos padrão", async () => {
    db.pipelineStageRule.findMany.mockRejectedValue(new Error("relation does not exist"));
    db.pipelineLostReason.findMany.mockRejectedValue(new Error("relation does not exist"));
    await expect(moveDealStage("d1", "s3")).resolves.toMatchObject({ stageId: "s3" });
    await expect(moveDealStage("d1", "sl", { perda: { motivo: "Preço" } })).resolves.toMatchObject({ lostReason: "Preço" });
  });
});

describe("createDeal grava a entrada na primeira etapa", () => {
  it("evento sem etapa de origem, com a origem informada; nunca valida obrigatórios", async () => {
    db.pipelineStageRule.findMany.mockResolvedValue([{ stageId: "s2", requiredFields: ["valor"], canBeSkipped: true, rottingDays: 7, guidance: "" }]);
    db.deal.create.mockResolvedValue({ id: "d9", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await createDeal({ orgId: "o1", name: "Teste", pipelineId: "p1", stageId: "s2", origem: "api" });
    expect(db.dealStageEvent.createMany).toHaveBeenCalledWith({
      data: [{ orgId: "o1", dealId: "d9", pipelineId: "p1", fromStageId: null, toStageId: "s2", origem: "api" }],
    });
  });
});
