import { describe, it, expect, vi, beforeEach } from "vitest";

type Job = Record<string, unknown>;
const estado = vi.hoisted(() => ({ job: null as Job | null, relogio: 0 }));

const db = vi.hoisted(() => ({
  bulkJob: {
    findMany: vi.fn(async ({ where }: { where: { id: { notIn: string[] } } }) => {
      const j = estado.job;
      if (!j || !["queued", "processing"].includes(j.status as string) || where.id.notIn.includes(j.id as string)) return [];
      return [{ ...j }];
    }),
    updateMany: vi.fn(async ({ data }: { data: Job }) => {
      Object.assign(estado.job!, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: { data: Job }) => Object.assign(estado.job!, data)),
    findUnique: vi.fn(async () => ({ status: estado.job!.status })),
  },
  idempotencyKey: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  customField: { findMany: vi.fn(async () => []) },
  contact: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
  externalRef: { findMany: vi.fn(async () => []) },
}));
const linhas = vi.hoisted(() => ({ processarLinha: vi.fn() }));
const storage = vi.hoisted(() => ({ enviarMidia: vi.fn(), baixarTexto: vi.fn(), midiaExiste: vi.fn(), urlAssinada: vi.fn(), urlDeUpload: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/storage", () => storage);
vi.mock("./linhas", async (orig) => ({ ...(await orig<typeof import("./linhas")>()), processarLinha: linhas.processarLinha }));

import { processarJobs } from "./processar-jobs";
import { ErroApi } from "./http";

const agora = () => estado.relogio;

function jobDeImportacao(extra: Job = {}): Job {
  return {
    id: "j1",
    orgId: "o1",
    kind: "import",
    entity: "contacts",
    status: "queued",
    format: "json",
    mode: "upsert",
    dryRun: false,
    options: {},
    records: Array.from({ length: 1200 }, (_, i) => ({ name: `Pessoa ${i}`, email: `p${i}@x.com` })),
    inputText: null,
    filePath: null,
    cursor: "",
    total: 1200,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
    result: {},
    buffer: "",
    lockedAt: null,
    startedAt: null,
    createdAt: new Date(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.relogio = 0;
  linhas.processarLinha.mockImplementation(async (_org: string, _e: string, linha: { row: number }) => {
    estado.relogio += 1; // 1 "ms" por linha: o orçamento é medido nisto
    if (linha.row === 1100) throw new ErroApi(400, "invalid_phone", "Telefone inválido.", { param: "phone" });
    return { result: linha.row % 2 ? "created" : "updated", id: `c${linha.row}` };
  });
});

describe("importação em fatias (retomável)", () => {
  it("para no orçamento com checkpoint e a rodada seguinte continua de onde parou", async () => {
    estado.job = jobDeImportacao();

    await processarJobs({ orcamentoMs: 700, agora });
    // Duas fatias de 500 (a 2ª começou dentro do orçamento), trava solta.
    expect(estado.job).toMatchObject({ status: "processing", cursor: "1000", processed: 1000, lockedAt: null });

    estado.relogio = 0;
    await processarJobs({ orcamentoMs: 700, agora });
    expect(estado.job).toMatchObject({ status: "completed_with_errors", cursor: "1200", processed: 1200, failed: 1 });
    expect((estado.job.created as number) + (estado.job.updated as number)).toBe(1199);
    expect(estado.job.errors).toEqual([
      expect.objectContaining({ row: 1100, code: "invalid_phone", param: "phone", record: { name: "Pessoa 1099", email: "p1099@x.com" } }),
    ]);
    expect(linhas.processarLinha).toHaveBeenCalledTimes(1200);
  });

  it("dry_run passa simular e cancelado no meio não anda mais", async () => {
    estado.job = jobDeImportacao({ dryRun: true, records: [{ name: "A" }] });
    await processarJobs({ orcamentoMs: 1000, agora });
    expect(linhas.processarLinha.mock.calls[0][3]).toMatchObject({ simular: true, modo: "upsert" });

    estado.job = jobDeImportacao({ status: "processing" });
    db.bulkJob.findUnique.mockResolvedValueOnce({ status: "canceled" });
    await processarJobs({ orcamentoMs: 1000, agora });
    expect(linhas.processarLinha).toHaveBeenCalledTimes(1);
  });

  it("CSV com cabeçalho em português e coluna de campo personalizado", async () => {
    estado.job = jobDeImportacao({ format: "csv", records: null, inputText: "Nome;E-mail;Cargo;Consumo kWh\nAna;ana@x.com;CEO;480\n", total: 1 });
    await processarJobs({ orcamentoMs: 1000, agora });
    expect(linhas.processarLinha.mock.calls[0][2]).toEqual({
      row: 2,
      record: { name: "Ana", email: "ana@x.com", job_title: "CEO", custom_fields: { "Consumo kWh": "480" } },
    });
    expect(estado.job).toMatchObject({ status: "completed", inputText: null });
  });
});

describe("exportação", () => {
  it("gera CSV em fatias e sobe para o Storage ao terminar", async () => {
    const contato = (i: number) => ({
      id: `c${String(i).padStart(4, "0")}`,
      orgId: "o1",
      name: `P${i}`,
      email: "",
      phone: "5511999998888",
      jobTitle: "",
      emails: [],
      phones: [],
      linkedinUrl: "",
      background: "",
      notes: "",
      customFields: {},
      source: "api",
      optIn: true,
      optOutAt: null,
      leadStage: null,
      companyId: null,
      ownerId: null,
      lastSeenAt: new Date(0),
      createdAt: new Date(0),
      updatedAt: new Date(1000 + i),
      tags: [{ tag: { id: "t1", name: "vip" } }],
      channels: [],
    });
    const todos = Array.from({ length: 1500 }, (_, i) => contato(i));
    db.contact.findMany.mockImplementation(async ({ where, take }: { where: { AND?: unknown[] }; take: number }) => {
      // Com cursor, a rota junta { AND: [filtros, { OR: [...] }] }.
      const temCursor = Array.isArray(where.AND) && where.AND.some((c) => !!c && typeof c === "object" && "OR" in c);
      return (temCursor ? todos.slice(1000) : todos).slice(0, take);
    });
    estado.job = {
      ...jobDeImportacao(),
      kind: "export",
      format: "csv",
      records: null,
      options: { filters: { tag: "t1" } },
      total: 1500,
    };

    await processarJobs({ orcamentoMs: 1000, agora });
    expect(storage.enviarMidia).toHaveBeenCalledTimes(1);
    const [caminho, corpo, mime] = storage.enviarMidia.mock.calls[0];
    expect(caminho).toBe("o1/exports/j1.csv");
    expect(mime).toBe("text/csv");
    const texto = corpo.toString("utf8");
    expect(texto.startsWith("﻿id;name")).toBe(true);
    expect(texto.trim().split("\r\n")).toHaveLength(1501);
    expect(texto).toContain(";vip;");
    expect(estado.job).toMatchObject({ status: "completed", processed: 1500, buffer: "", result: { file_path: "o1/exports/j1.csv", rows: 1500 } });
  });
});
