import { describe, it, expect, vi, beforeEach } from "vitest";
import { exemploProposta } from "@/lib/automacoes/exemplo.test-helpers";

const db = vi.hoisted(() => ({
  automacao: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  automacaoVersao: { findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  automacaoExecucao: { updateMany: vi.fn(), findMany: vi.fn() },
  automacaoPasso: { deleteMany: vi.fn() },
  eventoDeDominio: { deleteMany: vi.fn() },
  deal: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  segment: { findFirst: vi.fn() },
  contact: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));
const insc = vi.hoisted(() => ({
  inscrever: vi.fn(async (..._args: unknown[]) => ({ inscrita: true, execucaoId: "x" })),
  chaveDaInscricao: (a: string, o: string, origem: string) => `${a}:${o}:${origem}`,
}));
const executor = vi.hoisted(() => ({ executarExecucao: vi.fn(async () => ({ status: "concluida" })) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./inscricao", () => insc);
vi.mock("./executor", () => executor);
const hist = vi.hoisted(() => ({ limparHistoricoVencido: vi.fn(async () => 4) }));
vi.mock("@/lib/server/historico", () => hist);

import { rodarAutomacoes } from "./varreduras";
import { ErroDaAutomacao, publicarAutomacao } from "./gerenciar";

// Quarta 21/10/2026 10:30 em São Paulo.
const AGORA = new Date("2026-10-21T13:30:00Z");

const ativa = (gatilho: Record<string, unknown>, objeto = "deal") => ({
  id: "a1",
  orgId: "o1",
  objeto,
  versaoPublicadaId: "v1",
  reinscricao: "sempre",
  reinscricaoHoras: null,
  versaoPublicada: { definicao: { objeto, gatilho, inicio: null, nos: {} } },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.automacaoExecucao.updateMany.mockResolvedValue({ count: 0 });
  db.automacaoExecucao.findMany.mockResolvedValue([]);
});

describe("varreduras", () => {
  it("parado há dias: inscreve com a chave da passagem pela etapa", async () => {
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "deal.stale", config: { dias: 7 } })]);
    db.deal.findMany.mockResolvedValue([{ id: "d1", stageId: "s1", stageSince: new Date("2026-10-01T12:00:00Z") }]);
    const r = await rodarAutomacoes({ agora: AGORA });
    expect(r.inscritas).toBe(1);
    expect(insc.inscrever.mock.calls[0][1]).toBe("d1");
    expect(insc.inscrever.mock.calls[0][2]).toMatchObject({ origem: "parado:s1:2026-10-01T12:00:00.000Z" });
    const limite = db.deal.findMany.mock.calls[0][0].where.stageSince.lte as Date;
    expect(AGORA.getTime() - limite.getTime()).toBe(7 * 86_400_000);
  });

  it("mais de 200: quem já entrou no período sai antes e a varredura segue para a próxima página", async () => {
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "deal.schedule", config: { frequencia: "diaria", hora: "10:00" } })]);
    const id = (n: number) => `d${String(n).padStart(3, "0")}`;
    const primeira = Array.from({ length: 200 }, (_, i) => ({ id: id(i + 1) }));
    db.deal.findMany.mockResolvedValueOnce(primeira).mockResolvedValueOnce([{ id: id(201) }]);
    // Os 200 primeiros já têm execução com a chave de hoje.
    db.automacaoExecucao.findMany.mockImplementation(async ({ where }: { where: { chave?: { in: string[] } } }) =>
      (where.chave?.in ?? []).filter((c) => !c.includes(id(201))).map((chave) => ({ chave }))
    );

    const r = await rodarAutomacoes({ agora: AGORA });

    expect(db.deal.findMany.mock.calls[1][0].where.id).toEqual({ gt: id(200) });
    expect(insc.inscrever).toHaveBeenCalledTimes(1);
    expect(insc.inscrever.mock.calls[0][1]).toBe(id(201));
    expect(r.inscritas).toBe(1);
  });

  it("agendado: antes da hora não inscreve; depois, chave do dia", async () => {
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "deal.schedule", config: { frequencia: "diaria", hora: "11:00" } })]);
    db.deal.findMany.mockResolvedValue([{ id: "d1" }]);
    await rodarAutomacoes({ agora: AGORA });
    expect(insc.inscrever).not.toHaveBeenCalled();
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "deal.schedule", config: { frequencia: "diaria", hora: "10:00" } })]);
    await rodarAutomacoes({ agora: AGORA });
    expect(insc.inscrever.mock.calls[0][2]).toMatchObject({ origem: "agendado:2026-10-21" });
  });

  it("data de campo personalizado: consulta parametrizada; chave mal formada é recusada", async () => {
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "contact.date_relative", config: { campo: "registro.custom_fields.aniversario", dias: 0, hora: "09:00", todo_ano: true } }, "contact")]);
    db.$queryRawUnsafe.mockResolvedValue([{ id: "c1" }]);
    await rodarAutomacoes({ agora: AGORA });
    const [sql, ...params] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('FROM "eva_studio_contacts"');
    expect(sql).toContain("to_char(");
    expect(params).toEqual(["o1", "10-21", "aniversario"]);
    db.$queryRawUnsafe.mockClear();
    db.automacao.findMany.mockResolvedValue([ativa({ tipo: "contact.date_relative", config: { campo: "registro.custom_fields.x'; drop", dias: 0 } }, "contact")]);
    await rodarAutomacoes({ agora: AGORA });
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("roda as execuções vencidas e devolve leases vencidos à fila", async () => {
    db.automacao.findMany.mockResolvedValue([]);
    db.automacaoExecucao.updateMany.mockResolvedValue({ count: 2 });
    db.automacaoExecucao.findMany.mockResolvedValue([{ id: "x1" }, { id: "x2" }]);
    const r = await rodarAutomacoes({ agora: AGORA });
    expect(r).toMatchObject({ leases: 2, executadas: 2 });
    expect(executor.executarExecucao).toHaveBeenCalledTimes(2);
  });

  it("teste esquecido (janela fechada) para sozinho depois de 30 min", async () => {
    db.automacao.findMany.mockResolvedValue([]);
    await rodarAutomacoes({ agora: AGORA });
    const parada = db.automacaoExecucao.updateMany.mock.calls.find((c) => c[0].where.teste === true)?.[0];
    expect(parada).toBeDefined();
    expect(parada.where.status).toEqual({ in: ["pendente", "esperando"] });
    expect(AGORA.getTime() - (parada.where.createdAt.lt as Date).getTime()).toBe(30 * 60_000);
    expect(parada.data).toMatchObject({ status: "cancelada", proximaEm: null });
  });

  it("à hora cheia: limpa passos e eventos de 90 dias e o histórico de 2 anos", async () => {
    db.automacao.findMany.mockResolvedValue([]);
    db.automacaoPasso.deleteMany.mockResolvedValue({ count: 1 });
    db.eventoDeDominio.deleteMany.mockResolvedValue({ count: 2 });
    const horaCheia = new Date("2026-10-21T13:00:00Z");
    const r = await rodarAutomacoes({ agora: horaCheia });
    expect(hist.limparHistoricoVencido).toHaveBeenCalledWith(horaCheia);
    expect(r.limpos).toBe(7);
  });

  it("sem as tabelas: devolve zeros", async () => {
    db.automacaoExecucao.updateMany.mockRejectedValue(new Error('relation "eva_studio_automacao_execucoes" does not exist'));
    expect(await rodarAutomacoes({ agora: AGORA })).toEqual({ leases: 0, inscritas: 0, executadas: 0, limpos: 0 });
  });
});

describe("publicar", () => {
  it("com pendência: recusa e devolve os erros", async () => {
    db.automacao.findFirst.mockResolvedValue({ id: "a1", rascunho: { ...exemploProposta(), gatilho: null } });
    await expect(publicarAutomacao("o1", "a1", "u1")).rejects.toBeInstanceOf(ErroDaAutomacao);
  });

  it("versão nova (ignora a de teste, número 0), liga e retoma as pausadas", async () => {
    db.automacao.findFirst.mockResolvedValue({ id: "a1", rascunho: exemploProposta() });
    db.automacaoVersao.findFirst.mockResolvedValue({ numero: 2 });
    db.automacaoVersao.create.mockResolvedValue({ id: "v3", numero: 3 });
    db.automacaoExecucao.updateMany.mockResolvedValue({ count: 1 });
    const r = await publicarAutomacao("o1", "a1", "u1");
    expect(r.versao).toBe(3);
    expect(db.automacao.update.mock.calls[0][0].data).toMatchObject({ versaoPublicadaId: "v3", status: "ativa", falhasSeguidas: 0 });
    expect(db.automacaoExecucao.updateMany.mock.calls[0][0]).toMatchObject({ where: { automacaoId: "a1", status: "pausada" } });
  });
});
