import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  idempotencyKey: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  bulkJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  tag: { count: vi.fn() },
}));
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const storage = vi.hoisted(() => ({ urlDeUpload: vi.fn(), midiaExiste: vi.fn(), urlAssinada: vi.fn(), baixarTexto: vi.fn(), enviarMidia: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/storage", () => storage);

import { POST } from "./route";
import { POST as INICIAR } from "./[id]/start/route";
import { GET as LER } from "./[id]/route";

const req = (body: unknown, idem: string | null = "imp-1", url = "https://eva.test/api/v1/imports") =>
  new Request(url, {
    method: "POST",
    headers: { authorization: "Bearer evs_live_abc", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: JSON.stringify(body),
  });
const semParams = { params: Promise.resolve({ contract: "o1" }) } as { params: Promise<{ contract: string }> };

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "j1",
  kind: "import",
  entity: "contacts",
  status: "queued",
  format: "json",
  mode: "upsert",
  dryRun: false,
  options: {},
  total: 2,
  processed: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  errors: [],
  result: {},
  createdAt: new Date(),
  startedAt: null,
  finishedAt: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["imports:write"] });
  db.apiKey.update.mockResolvedValue({});
  rate.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 300, resetSec: 60 });
  db.idempotencyKey.findUnique.mockResolvedValue(null);
  db.idempotencyKey.create.mockResolvedValue({});
  db.idempotencyKey.update.mockResolvedValue({});
  db.bulkJob.findFirst.mockResolvedValue(null);
  db.bulkJob.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => linha(data));
});

describe("POST /v1/imports", () => {
  it("records inline: 202 com o job na fila", async () => {
    const res = await POST(req({ entity: "contacts", records: [{ name: "A" }, { email: "b@x.com" }], dry_run: true }), semParams);
    expect(res.status).toBe(202);
    expect(db.bulkJob.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", kind: "import", status: "queued", total: 2, dryRun: true, format: "json" });
    expect((await res.json()).data).toMatchObject({ type: "import", status: "queued", dry_run: true });
  });

  it("exige Idempotency-Key, uma fonte só e no máximo 5 mil registros", async () => {
    expect((await (await POST(req({ entity: "contacts", records: [{}] }, null), semParams)).json()).error.code).toBe("idempotency_key_required");
    const duas = await POST(req({ entity: "contacts", records: [{}], csv: "a\nb" }), semParams);
    expect(duas.status).toBe(400);
    const muitos = await POST(req({ entity: "deals", records: Array.from({ length: 5001 }, () => ({})) }, "imp-2"), semParams);
    expect((await muitos.json()).error.param).toBe("records");
  });

  it("uma importação ativa por organização: 409 import_in_progress", async () => {
    db.bulkJob.findFirst.mockResolvedValueOnce({ id: "j0" });
    const res = await POST(req({ entity: "contacts", csv: "nome\nAna" }), semParams);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "import_in_progress", details: { import_id: "j0" } });
  });

  it("upload: devolve upload_url e fica pending_upload; start confere o arquivo", async () => {
    storage.urlDeUpload.mockResolvedValue({ url: "https://storage/upload?token=t", token: "t" });
    const res = await POST(req({ entity: "deals", upload: true, format: "csv" }), semParams);
    const { data } = await res.json();
    expect(data).toMatchObject({ status: "pending_upload", upload_url: "https://storage/upload?token=t", upload_method: "PUT" });
    expect(storage.urlDeUpload.mock.calls[0][0]).toMatch(/^o1\/imports\/.+\.csv$/);

    db.bulkJob.findFirst.mockResolvedValue(linha({ status: "pending_upload", filePath: "o1/imports/x.csv" }));
    storage.midiaExiste.mockResolvedValueOnce({ existe: false, tamanho: 0 });
    const semArquivo = await INICIAR(req({}, null, "https://eva.test/api/v1/imports/j1/start"), { params: Promise.resolve({ contract: "o1", id: "j1" }) });
    expect((await semArquivo.json()).error.code).toBe("upload_missing");

    storage.midiaExiste.mockResolvedValueOnce({ existe: true, tamanho: 10 });
    db.bulkJob.update.mockResolvedValue(linha({ status: "queued" }));
    const ok = await INICIAR(req({}, null, "https://eva.test/api/v1/imports/j1/start"), { params: Promise.resolve({ contract: "o1", id: "j1" }) });
    expect(ok.status).toBe(202);
    expect(db.bulkJob.update).toHaveBeenCalledWith({ where: { id: "j1" }, data: { status: "queued" } });
  });
});

describe("escopo para ler a importação", () => {
  const umJob = { params: Promise.resolve({ contract: "o1", id: "j1" }) };
  const ler = () => new Request("https://eva.test/api/v1/imports/j1", { headers: { authorization: "Bearer evs_live_abc" } });

  it("imports:read lê; imports:write (chaves antigas) continua lendo; outro recurso: 403", async () => {
    db.bulkJob.findFirst.mockResolvedValue(linha());
    for (const scopes of [["imports:read"], ["imports:write"]]) {
      db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes });
      expect((await LER(ler(), umJob)).status).toBe(200);
    }
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["exports:*"] });
    expect((await LER(ler(), umJob)).status).toBe(403);
  });
});
