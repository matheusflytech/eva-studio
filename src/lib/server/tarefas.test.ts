import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => {
  const db = {
    task: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    taskDetail: { findMany: vi.fn(), upsert: vi.fn() },
    note: { create: vi.fn() },
    deal: { findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn(), findMany: vi.fn() },
    profile: { findFirst: vi.fn() },
    teamMember: { findMany: vi.fn() },
    conversation: { findMany: vi.fn(), findUnique: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return db;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const auth = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  ctxPode: vi.fn(() => true),
}));
vi.mock("@/lib/server/permissions", () => auth);

import { adiarTarefa, aplicarEmMassa, carregarTarefaVisivel, concluirTarefa, intervaloDoPrazo, listarTarefas, quickAdd, ErroDeTarefa } from "./tarefas";
import { gravarDetalhes, lerDetalhes } from "./tarefas-detalhes";
import { POST as concluirRota } from "@/app/api/tasks/[taskId]/concluir/route";
import { PATCH } from "@/app/api/tasks/[taskId]/route";

// Terça, 20/10/2026, 10:00 em SP.
const AGORA = new Date("2026-10-20T13:00:00Z");
const ctxTodos = { userId: "u1", orgId: "o1", role: "agent" as const };
const ctxProprios = { ...ctxTodos, escopo: { negocios: "proprios" as const, contatos: "proprios" as const, conversas: "todos" as const } };
const ctxEquipe = { ...ctxTodos, escopo: { negocios: "equipe" as const, contatos: "todos" as const, conversas: "todos" as const } };

function tarefa(extra: Record<string, unknown> = {}) {
  return {
    id: "t1",
    orgId: "o1",
    contactId: "c1",
    dealId: "d1",
    assignedToId: "u1",
    type: "ligar",
    text: "Ligar João",
    dueAt: new Date("2026-10-20T12:00:00Z"),
    doneAt: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    updatedAt: new Date("2026-10-01T12:00:00Z"),
    ...extra,
  };
}

const tabelaAusente = () => new Prisma.PrismaClientKnownRequestError("The table `eva_studio_task_details` does not exist", { code: "P2021", clientVersion: "7" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctxPode.mockReturnValue(true);
  auth.requirePermission.mockResolvedValue(ctxTodos);
  db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? arg(db) : Promise.all(arg as Promise<unknown>[])));
  db.task.updateMany.mockResolvedValue({ count: 1 });
  db.task.create.mockResolvedValue({ id: "t2" });
  db.note.create.mockResolvedValue({ id: "n1", createdAt: AGORA });
  db.taskDetail.upsert.mockResolvedValue({});
  db.taskDetail.findMany.mockResolvedValue([]);
  db.teamMember.findMany.mockResolvedValue([{ userId: "u2" }, { userId: "u1" }]);
  db.$executeRaw.mockResolvedValue(1);
});

describe("tabela de detalhes ausente", () => {
  it("leitura volta vazia e marca indisponível", async () => {
    db.taskDetail.findMany.mockRejectedValue(tabelaAusente());
    const r = await lerDetalhes(["t1"]);
    expect(r.disponivel).toBe(false);
    expect(r.mapa.size).toBe(0);
  });

  it("escrita não derruba quem chamou", async () => {
    db.taskDetail.upsert.mockRejectedValue(tabelaAusente());
    await expect(gravarDetalhes({ id: "t1", orgId: "o1" }, { priority: "alta" })).resolves.toBe(false);
  });

  it("conclusão funciona sem a tabela (nota vai para a timeline)", async () => {
    db.taskDetail.upsert.mockRejectedValue(tabelaAusente());
    const r = await concluirTarefa(ctxTodos, tarefa() as never, { resultado: "nao_atendeu", nota: "caixa postal", proximo: { decisao: "sem_proximo" } }, AGORA);
    expect(r.detalhesGravados).toBe(false);
    expect(db.note.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dealId: "d1", contactId: "c1", text: "Tarefa concluída: Ligar João\nLigação · Não atendeu — caixa postal" }),
    });
  });
});

describe("conclusão", () => {
  it("agendar cria a próxima no mesmo negócio/contato e registra a decisão", async () => {
    const dueAt = new Date("2026-10-21T13:00:00Z");
    const r = await concluirTarefa(
      ctxTodos,
      tarefa() as never,
      { resultado: "falou", nota: "", proximo: { decisao: "agendou", tarefa: { tipo: "whatsapp", texto: "Mandar proposta", dueAt, diaTodo: false } } },
      AGORA
    );
    expect(r.proximaId).toBe("t2");
    expect(db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "whatsapp", text: "Mandar proposta", dealId: "d1", contactId: "c1", assignedToId: "u1", dueAt }),
    });
    expect(db.taskDetail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ outcome: "falou", nextStepDecision: "agendou", nextTaskId: "t2" }) })
    );
    // Toca a atividade do negócio (relógio do "parado").
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it("já concluída em outra aba → 409, sem criar próxima", async () => {
    db.task.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      concluirTarefa(ctxTodos, tarefa() as never, { resultado: "falou", nota: "", proximo: { decisao: "sem_proximo" } }, AGORA)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rota exige a decisão do próximo passo", async () => {
    db.task.findFirst.mockResolvedValue(tarefa());
    const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
    const params = { params: Promise.resolve({ taskId: "t1" }) };
    const sem = await concluirRota(req({ resultado: "falou" }), params);
    expect(sem.status).toBe(422);
    expect((await sem.json()).codigo).toBe("proximo_passo_obrigatorio");
    expect(db.task.updateMany).not.toHaveBeenCalled();
    const ok = await concluirRota(req({ resultado: "falou", proximo: { decisao: "sem_proximo" } }), params);
    expect(ok.status).toBe(200);
  });

  it("PATCH done:true sem decisão → 422; reabrir continua", async () => {
    db.task.findFirst.mockResolvedValue(tarefa());
    db.task.update.mockResolvedValue(tarefa({ doneAt: null }));
    const req = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
    const params = { params: Promise.resolve({ taskId: "t1" }) };
    const r = await PATCH(req({ done: true }), params);
    expect(r.status).toBe(422);
    db.task.findFirst.mockResolvedValue(tarefa({ doneAt: AGORA }));
    const reabrir = await PATCH(req({ done: false }), params);
    expect(reabrir.status).toBe(200);
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: expect.objectContaining({ doneAt: null }) });
  });
});

describe("adiar", () => {
  it("empurra a previsão do negócio quando pedido", async () => {
    db.deal.findFirst.mockResolvedValue({ id: "d1", ownerId: "u1", expectedClosingAt: new Date("2026-10-30T12:00:00Z"), closedAt: null });
    const r = await adiarTarefa(ctxTodos, tarefa() as never, { opcao: "segunda", empurrarPrevisao: true }, AGORA);
    // 20/10 → 26/10 = 6 dias
    expect(r.previsao).toBe("2026-11-05T12:00:00.000Z");
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { expectedClosingAt: new Date("2026-11-05T12:00:00Z") } });
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { dueAt: new Date("2026-10-26T12:00:00Z") } });
    expect(db.taskDetail.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ snoozedCount: { increment: 1 } }) }));
  });

  it("sem pedir, não mexe na previsão", async () => {
    await adiarTarefa(ctxTodos, tarefa() as never, { opcao: "amanha" }, AGORA);
    expect(db.deal.findFirst).not.toHaveBeenCalled();
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("sem permissão de editar o negócio: adia a tarefa e avisa", async () => {
    auth.ctxPode.mockReturnValue(false);
    db.deal.findFirst.mockResolvedValue({ id: "d1", ownerId: "u1", expectedClosingAt: new Date("2026-10-30T12:00:00Z"), closedAt: null });
    const r = await adiarTarefa(ctxTodos, tarefa() as never, { opcao: "amanha", empurrarPrevisao: true }, AGORA);
    expect(r.aviso).toMatch(/não pode editar/);
    expect(db.deal.update).not.toHaveBeenCalled();
    expect(db.task.update).toHaveBeenCalled();
  });

  it("tarefa concluída não se adia", async () => {
    await expect(adiarTarefa(ctxTodos, tarefa({ doneAt: AGORA }) as never, { opcao: "1h" }, AGORA)).rejects.toBeInstanceOf(ErroDeTarefa);
  });
});

describe("escopo e permissão", () => {
  it("só os meus: tarefa de outra pessoa não aparece", async () => {
    db.task.findFirst.mockResolvedValue(tarefa({ assignedToId: "u9" }));
    expect(await carregarTarefaVisivel(ctxProprios, "t1")).toBeNull();
    db.task.findFirst.mockResolvedValue(tarefa({ assignedToId: "u1" }));
    expect(await carregarTarefaVisivel(ctxProprios, "t1")).not.toBeNull();
  });

  it("equipe: colega sim, de fora não", async () => {
    db.task.findFirst.mockResolvedValue(tarefa({ assignedToId: "u2" }));
    expect(await carregarTarefaVisivel(ctxEquipe, "t1")).not.toBeNull();
    db.task.findFirst.mockResolvedValue(tarefa({ assignedToId: "u9" }));
    expect(await carregarTarefaVisivel(ctxEquipe, "t1")).toBeNull();
  });

  it("rota responde 404 para tarefa fora do escopo", async () => {
    auth.requirePermission.mockResolvedValue(ctxProprios);
    db.task.findFirst.mockResolvedValue(tarefa({ assignedToId: "u9" }));
    const r = await concluirRota(new Request("http://x", { method: "POST", body: JSON.stringify({ resultado: "falou", proximo: { decisao: "sem_proximo" } }) }), {
      params: Promise.resolve({ taskId: "t1" }),
    });
    expect(r.status).toBe(404);
  });

  it("em massa ignora o que está fora do escopo", async () => {
    db.task.findMany.mockResolvedValue([tarefa({ id: "a", assignedToId: "u1" }), tarefa({ id: "b", assignedToId: "u9" })]);
    db.task.update.mockResolvedValue({});
    const r = await aplicarEmMassa(ctxProprios, ["a", "b"], { acao: "reagendar", para: "segunda" }, AGORA);
    expect(r).toEqual({ alteradas: 1, ignoradas: 1 });
    expect(db.task.update).toHaveBeenCalledTimes(1);
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { dueAt: new Date("2026-10-26T12:00:00Z") } });
  });

  it("reatribuir para fora do escopo → 403", async () => {
    db.task.findMany.mockResolvedValue([tarefa({ id: "a" })]);
    db.profile.findFirst.mockResolvedValue({ id: "u9" });
    await expect(aplicarEmMassa(ctxProprios, ["a"], { acao: "reatribuir", responsavelId: "u9" }, AGORA)).rejects.toMatchObject({ status: 403 });
  });

  it("concluir em massa registra 'sem próximo passo'", async () => {
    db.task.findMany.mockResolvedValue([tarefa({ id: "a" }), tarefa({ id: "b", doneAt: AGORA })]);
    const r = await aplicarEmMassa(ctxTodos, ["a", "b"], { acao: "concluir", resultado: "outro", nota: "" }, AGORA);
    expect(r).toEqual({ alteradas: 1, ignoradas: 1 });
    expect(db.taskDetail.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ nextStepDecision: "sem_proximo" }) }));
  });
});

describe("quick add", () => {
  it("vincula o único contato com o nome e o negócio aberto dele", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", name: "João Silva" }]);
    db.deal.findFirst.mockResolvedValue({ id: "d1", name: "Acme", orgId: "o1" });
    db.task.create.mockResolvedValue({ id: "t9", orgId: "o1" });
    const r = await quickAdd(ctxTodos, "ligar João amanhã 14h", {}, AGORA);
    expect(r.contato).toEqual({ id: "c1", nome: "João Silva" });
    expect(r.negocio).toEqual({ id: "d1", nome: "Acme" });
    expect(db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "ligar", text: "Ligar João", contactId: "c1", dealId: "d1", assignedToId: "u1", dueAt: new Date("2026-10-21T17:00:00Z") }),
    });
  });

  it("nome ambíguo fica sem vínculo; escopo de contatos filtra por dono", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", name: "João A" }, { id: "c2", name: "João B" }]);
    db.task.create.mockResolvedValue({ id: "t9", orgId: "o1" });
    const r = await quickAdd(ctxProprios, "ligar João amanhã", {}, AGORA);
    expect(r.ambiguo).toBe(true);
    expect(r.contato).toBeNull();
    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: { in: ["u1"] } }) }));
  });

  it("texto vazio → erro", async () => {
    await expect(quickAdd(ctxTodos, "amanhã 14h", {}, AGORA)).rejects.toBeInstanceOf(ErroDeTarefa);
  });
});

describe("lista por intervalo de prazo (calendário)", () => {
  it("dias de SP viram [meia-noite do primeiro, meia-noite do dia seguinte ao último)", () => {
    expect(intervaloDoPrazo("2026-09-27", "2026-10-31")).toEqual({
      gte: new Date("2026-09-27T03:00:00.000Z"),
      lt: new Date("2026-11-01T03:00:00.000Z"),
    });
  });

  it("sem os dois dias: sem intervalo; data inválida, invertida ou longa demais: inválido", () => {
    expect(intervaloDoPrazo(null, null)).toBeNull();
    expect(intervaloDoPrazo("2026-10-01", null)).toBe("invalido");
    expect(intervaloDoPrazo("2026-13-01", "2026-10-31")).toBe("invalido");
    expect(intervaloDoPrazo("2026-10-31", "2026-10-01")).toBe("invalido");
    expect(intervaloDoPrazo("2026-01-01", "2026-12-31")).toBe("invalido");
  });

  it("com intervalo, filtra por dueAt e busca até 500", async () => {
    db.task.findMany.mockResolvedValue([]);
    await listarTarefas(ctxTodos, { visao: "minhas", status: "todas", prazo: intervaloDoPrazo("2026-09-27", "2026-10-31") as { gte: Date; lt: Date } });
    const args = db.task.findMany.mock.calls.at(-1)?.[0];
    expect(args.where).toMatchObject({ orgId: "o1", assignedToId: { in: ["u1"] }, dueAt: { gte: new Date("2026-09-27T03:00:00.000Z"), lt: new Date("2026-11-01T03:00:00.000Z") } });
    expect(args.take).toBe(500);
  });
});
