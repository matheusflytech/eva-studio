import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  broadcast: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  broadcastVariant: { update: vi.fn() },
  contactChannel: { findMany: vi.fn(async () => []) },
  contact: { findMany: vi.fn(async () => []) },
  segment: { findUnique: vi.fn() },
  messageTemplate: { findMany: vi.fn(async () => []) },
  conversation: { findUnique: vi.fn() },
  outboundQueueItem: { findMany: vi.fn(async () => [] as { contactId: string }[]), create: vi.fn() },
  $executeRaw: vi.fn(async () => 1),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const vez = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimit: vez }));

const deliver = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/outbound", () => ({ deliverToContact: deliver }));

import { runBroadcast, runDueBroadcasts } from "./broadcast-runner";

function disparo(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    agentId: "a1",
    channel: "whatsapp_qr",
    text: "Oi {nome}",
    templateId: null,
    audience: "manual",
    segmentId: null,
    tagIds: [],
    manualRecipients: ["5511999990001", "5511999990002", "5511999990003"],
    status: "sending",
    kind: "campaign",
    variants: [],
    agent: { orgId: "o1" },
    ...over,
  };
}

/** Lê os valores da instrução final (tagged template do $executeRaw). */
function fechamento() {
  const call = db.$executeRaw.mock.calls.at(-1) as unknown as [TemplateStringsArray, ...unknown[]];
  const sql = call[0].join("?");
  const [total, sent, failed, lastError] = call.slice(1);
  return { sql, total, sent, failed, lastError };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.broadcast.updateMany.mockResolvedValue({ count: 1 });
  db.outboundQueueItem.findMany.mockResolvedValue([]);
  vez.mockResolvedValue({ allowed: true });
});

describe("contagem do disparo", () => {
  it("WhatsApp QR: item na fila NÃO conta como enviado no app (quem conta é o worker)", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo());
    deliver.mockResolvedValue({ ok: true, queued: true, id: "q" });

    const r = await runBroadcast("b1");

    expect(r).toMatchObject({ totalCount: 3, sentCount: 0, failedCount: 0, queuedCount: 3 });
    const f = fechamento();
    expect(f).toMatchObject({ total: 3, sent: 0, failed: 0 });
    // Fechamento numa instrução só: done só quando enviados + falhas >= total.
    expect(f.sql).toMatch(/CASE/);
    expect(f.sql).toMatch(/"sentCount" \+ \? \+ "failedCount" \+ \? >= \?/);
  });

  it("WhatsApp oficial: envio direto soma no app", async () => {
    db.broadcast.findUnique.mockResolvedValue(
      disparo({ channel: "whatsapp_meta", templateId: "t1", manualRecipients: ["5511999990001", "5511999990002"] })
    );
    db.messageTemplate.findMany.mockResolvedValue([
      { id: "t1", metaTemplateName: "promo", metaLanguageCode: "pt_BR", variableOrder: ["nome"] },
    ] as never);
    deliver.mockResolvedValueOnce({ ok: true, id: "w1" }).mockResolvedValueOnce({ ok: false, error: "Número inválido" });

    const r = await runBroadcast("b1");

    expect(r).toMatchObject({ sentCount: 1, failedCount: 1, queuedCount: 0 });
    expect(fechamento()).toMatchObject({ total: 2, sent: 1, failed: 1, lastError: "Número inválido" });
    expect(deliver.mock.calls[0][0].template).toEqual({ name: "promo", languageCode: "pt_BR", parameters: [""] });
  });

  it("variante: na fila não soma no placar (o worker soma); falha soma", async () => {
    db.broadcast.findUnique.mockResolvedValue(
      disparo({ manualRecipients: ["1", "2"], variants: [{ id: "v1", text: "A", templateId: null, weight: 1 }] })
    );
    deliver.mockResolvedValueOnce({ ok: true, queued: true }).mockResolvedValueOnce({ ok: false, error: "x" });

    await runBroadcast("b1");

    expect(db.broadcastVariant.update).toHaveBeenCalledTimes(1);
    expect(db.broadcastVariant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { failedCount: { increment: 1 } } });
  });

  it("disparo concluído ou cancelado não roda de novo", async () => {
    for (const status of ["done", "canceled"]) {
      db.broadcast.findUnique.mockResolvedValue(disparo({ status }));
      await runBroadcast("b1");
    }
    expect(deliver).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("agendado", () => {
  it("vira 'sending' de forma atômica antes de entregar", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo({ status: "scheduled" }));
    deliver.mockResolvedValue({ ok: true, queued: true });

    await runBroadcast("b1");

    expect(db.broadcast.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "scheduled" },
      data: { status: "sending" },
    });
    expect(deliver).toHaveBeenCalledTimes(3);
  });

  it("outra batida do relógio já pegou: não entrega nada", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo({ status: "scheduled" }));
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });

    const r = await runBroadcast("b1");

    expect(r.sentCount).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("runDueBroadcasts busca os agendados vencidos e os em andamento de qualquer canal (saem em partes), do mais antigo pro mais novo", async () => {
    db.broadcast.findMany.mockResolvedValue([]);
    await runDueBroadcasts(5);
    const arg = db.broadcast.findMany.mock.calls[0][0];
    expect(arg.where.OR[0].status).toBe("scheduled");
    expect(arg.where.OR[0].scheduledAt.lte).toBeInstanceOf(Date);
    expect(arg.where.OR[1]).toEqual({ status: "sending" });
    expect(arg.orderBy).toEqual({ scheduledAt: "asc" });
    expect(arg.take).toBe(5);
  });
});

describe("mensagem avulsa no WhatsApp oficial (janela de 24h)", () => {
  const avulsa = (over: Record<string, unknown> = {}) =>
    disparo({ kind: "single", channel: "whatsapp_meta", manualRecipients: ["5511999990001"], text: "Bom dia!", ...over });

  it("janela aberta e sem modelo: manda texto", async () => {
    db.broadcast.findUnique.mockResolvedValue(avulsa());
    db.conversation.findUnique.mockResolvedValue({ lastContactMessageAt: new Date(Date.now() - 60 * 60 * 1000) });
    deliver.mockResolvedValue({ ok: true, id: "w" });

    const r = await runBroadcast("b1");

    expect(r.sentCount).toBe(1);
    expect(deliver.mock.calls[0][0].template).toBeUndefined();
    expect(db.conversation.findUnique).toHaveBeenCalledWith({
      where: { agentId_channel_contactId: { agentId: "a1", channel: "whatsapp_meta", contactId: "5511999990001" } },
      select: { lastContactMessageAt: true },
    });
  });

  it("janela fechada e sem modelo: não tenta e grava o motivo", async () => {
    db.broadcast.findUnique.mockResolvedValue(avulsa());
    db.conversation.findUnique.mockResolvedValue({ lastContactMessageAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });

    const r = await runBroadcast("b1");

    expect(deliver).not.toHaveBeenCalled();
    expect(r.failedCount).toBe(1);
    expect(String(fechamento().lastError)).toMatch(/janela de 24h/i);
  });

  it("com modelo: manda o modelo", async () => {
    db.broadcast.findUnique.mockResolvedValue(avulsa({ templateId: "t1" }));
    db.messageTemplate.findMany.mockResolvedValue([
      { id: "t1", metaTemplateName: "lembrete", metaLanguageCode: "pt_BR", variableOrder: [] },
    ] as never);
    db.conversation.findUnique.mockResolvedValue(null);
    deliver.mockResolvedValue({ ok: true, id: "w" });

    await runBroadcast("b1");

    expect(deliver.mock.calls[0][0].template).toEqual({ name: "lembrete", languageCode: "pt_BR", parameters: [] });
  });
});

describe("disparo grande sai em partes", () => {
  /** Último parâmetro do CASE: quantos ainda faltam nesta parte. */
  const faltam = () => (db.$executeRaw.mock.calls.at(-1) as unknown as unknown[])[5];

  it("continua de onde parou: quem já tem registro do disparo não recebe de novo", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo({ channel: "whatsapp_meta", templateId: "t1" }));
    db.outboundQueueItem.findMany.mockResolvedValue([{ contactId: "5511999990001" }]);
    deliver.mockResolvedValue({ ok: true, id: "w" });

    const r = await runBroadcast("b1");

    expect(deliver.mock.calls.map((c) => c[0].to)).toEqual(["5511999990002", "5511999990003"]);
    expect(r).toMatchObject({ totalCount: 3, sentCount: 2 });
    expect(faltam()).toBe(0);
  });

  it("tempo da parte acabou: grava o que saiu e fica 'sending' para a próxima batida", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo({ channel: "whatsapp_meta", templateId: "t1" }));

    await runBroadcast("b1", Date.now() - 1);

    expect(deliver).not.toHaveBeenCalled();
    expect(faltam()).toBe(3);
  });

  it("falha deixa registro, para não ser tentada a cada batida", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo({ channel: "whatsapp_meta", templateId: "t1", manualRecipients: ["5511999990001"] }));
    deliver.mockResolvedValue({ ok: false, error: "Número inválido" });

    await runBroadcast("b1");

    expect(db.outboundQueueItem.create.mock.calls[0][0].data).toMatchObject({
      broadcastId: "b1",
      contactId: "5511999990001",
      status: "failed",
      error: "Número inválido",
    });
  });

  it("outra rodada do mesmo disparo em andamento: não envia nada", async () => {
    db.broadcast.findUnique.mockResolvedValue(disparo());
    vez.mockResolvedValue({ allowed: false });

    await runBroadcast("b1");

    expect(deliver).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
