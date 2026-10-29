import { describe, it, expect, vi, beforeEach } from "vitest";

type Ev = { id: string; orgId: string; hotmartEventId: string; result: string; createdAt: Date; payload: unknown; [k: string]: unknown };
const db = vi.hoisted(() => {
  const s = { events: [] as Ev[], job: {} as Record<string, unknown>, contacts: [] as { email: string; customFields: Record<string, unknown> }[], refs: [] as { source: string; externalId: string }[], sales: [] as string[] };
  const pending = (where: { orgId: string }) => s.events.filter((e) => e.orgId === where.orgId && e.result === "pending" && e.hotmartEventId.startsWith("import:"));
  return {
    s,
    hotmartEvent: {
      createMany: vi.fn(async ({ data, skipDuplicates }: { data: Ev[]; skipDuplicates: boolean }) => {
        let count = 0;
        for (const d of data) {
          if (s.events.some((e) => e.hotmartEventId === d.hotmartEventId)) {
            if (!skipDuplicates) throw new Error("P2002");
            continue;
          }
          s.events.push({ ...d, createdAt: d.createdAt ?? new Date(), id: `e${s.events.length}` });
          count++;
        }
        return { count };
      }),
      findMany: vi.fn(async ({ where, take }: { where: { orgId: string }; take?: number }) =>
        [...pending(where)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, take ?? 1e9)
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Ev> }) => Object.assign(s.events.find((e) => e.id === where.id)!, data)),
      deleteMany: vi.fn(async ({ where }: { where: { orgId: string } }) => {
        const p = new Set(pending(where));
        s.events = s.events.filter((e) => !p.has(e));
        return { count: p.size };
      }),
    },
    bulkJob: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(s.job, data)),
      findUnique: vi.fn(async () => ({ status: s.job.status })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(s.job, { cursor: "", buffer: "", total: 0, processed: 0, updated: 0, unchanged: 0, failed: 0 }, data, { id: "j1" })),
    },
    contact: {
      findMany: vi.fn(async ({ where }: { where: { email?: { in: string[] }; OR?: { customFields: { equals: string } }[] } }) =>
        where.email
          ? s.contacts.filter((c) => where.email!.in.includes(c.email.toLowerCase()))
          : s.contacts.filter((c) => where.OR!.some((o) => c.customFields.cpf_cnpj === o.customFields.equals))
      ),
    },
    externalRef: {
      count: vi.fn(async ({ where }: { where: { source: string; externalId: { in: string[] } } }) =>
        s.refs.filter((r) => r.source === where.source && where.externalId.in.includes(r.externalId)).length
      ),
    },
    sale: { count: vi.fn(async ({ where }: { where: { transaction: { in: string[] } } }) => s.sales.filter((t) => where.transaction.in.includes(t)).length) },
  };
});
const applied = vi.hoisted(() => ({ calls: [] as { event: string; origin?: string; teste?: boolean }[], ator: null as { teste?: boolean } | null }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/eventos/barramento", () => ({
  comAtor: async (ator: { teste?: boolean }, fn: () => Promise<unknown>) => {
    applied.ator = ator;
    try {
      return await fn();
    } finally {
      applied.ator = null;
    }
  },
}));
vi.mock("./apply", () => ({
  applyEvent: vi.fn(async (_o: string, _p: unknown, payload: { event: string }, _m: unknown, opts: { origin?: string }) => {
    applied.calls.push({ event: payload.event, origin: opts.origin, teste: applied.ator?.teste });
    return { result: "ok", detail: "ok", contactId: "c", dealId: "d" };
  }),
}));
const products = {
  "111": { slug: "curso", name: "Curso", model: "one_time" as const, pipelineId: "p1", stages: {} },
  "222": { slug: "club", name: "Club", model: "subscription" as const, pipelineId: "p2", stages: {} },
};
vi.mock("./connection", () => ({
  getConnection: async () => ({ id: "conn", secrets: "x", products, fields: {} }),
  apiCredentialsOf: () => ({ clientId: "a", clientSecret: "b", basic: "c" }),
}));

// API falsa: respostas no formato da doc da Hotmart.
const T0 = Date.UTC(2025, 0, 10, 15);
const sale = (tx: string, productId: number, status: string, email: string, approved: number, extra: Record<string, unknown> = {}) => ({
  product: { id: productId, name: "x" },
  buyer: { name: email.split("@")[0], email },
  purchase: { transaction: tx, order_date: approved - 1000, approved_date: approved, status, price: { value: 100, currency_code: "BRL" }, payment: { type: "PIX" }, ...extra },
});
const api = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("./api", () => ({
  getPage: vi.fn(async (_c: unknown, path: string, params: Record<string, string | number | undefined>) => {
    api.pages.push(`${path}:${params.product_id}:${params.transaction_status ?? ""}:${params.page_token ?? ""}`);
    const pid = Number(params.product_id);
    if (path === "/subscriptions") {
      return pid === 222
        ? { items: [
            { subscriber_code: "S1", status: "ACTIVE", plan: { name: "Mensal" }, transaction: "C1", subscriber: { email: "bia@x.com" } },
            { subscriber_code: "S2", status: "CANCELLED_BY_CUSTOMER", plan: { name: "Mensal" }, transaction: "C2", subscriber: { email: "caio@x.com" }, end_accession_date: T0 + 90 * 86400e3 },
          ], nextPageToken: null }
        : { items: [], nextPageToken: null };
    }
    if (path === "/sales/users") return { items: [], nextPageToken: null };
    const st = params.transaction_status;
    if (pid === 111 && st === "APPROVED") {
      // Duas páginas, a segunda com venda mais antiga.
      return params.page_token
        ? { items: [sale("A0", 111, "APPROVED", "ana@x.com", T0 - 86400e3)], nextPageToken: null }
        : { items: [sale("A1", 111, "APPROVED", "ana@x.com", T0)], nextPageToken: "p2" };
    }
    if (pid === 111 && st === "REFUNDED") return { items: [sale("R1", 111, "REFUNDED", "duda@x.com", T0 + 1000)], nextPageToken: null };
    if (pid === 222 && st === "APPROVED") return { items: [sale("C1", 222, "APPROVED", "bia@x.com", T0 + 2000), sale("C2", 222, "APPROVED", "caio@x.com", T0 + 3000)], nextPageToken: null };
    return { items: [], nextPageToken: null };
  }),
}));

import { cancelImport, confirmImport, countPreview, processHotmartImport, startImport } from "./import";
import type { BulkJob } from "@/generated/prisma/client";

const job = () => db.s.job as unknown as BulkJob;
async function runUntil(status: string) {
  for (let i = 0; i < 10 && db.s.job.status !== status; i++) {
    db.s.job.status = "processing";
    await processHotmartImport({ ...job() }, () => true);
  }
}

beforeEach(() => {
  db.s.events = [];
  db.s.job = {};
  db.s.contacts = [];
  db.s.refs = [];
  db.s.sales = [];
  applied.calls = [];
  api.pages = [];
});

describe("importação da Hotmart", () => {
  it("período inválido é recusado", async () => {
    await expect(startImport("o1", { from: "2025-02-01", to: "2025-01-01" })).rejects.toMatchObject({ status: 400 });
  });

  it("busca -> prévia -> aplicar, em ordem de data, sem disparar nada", async () => {
    await startImport("o1", { from: "2020-01-01", to: "2025-12-31" });
    expect(db.s.job).toMatchObject({ kind: "hotmart_import", status: "queued", options: { phase: "fetch", products: ["111", "222"] } });

    db.s.contacts = [{ email: "Ana@x.com", customFields: {} }];
    db.s.refs = [{ source: "hotmart", externalId: "A0" }];
    db.s.sales = ["A0"];
    await runUntil("awaiting_confirmation");
    expect(api.pages).toContain("/sales/history:111:APPROVED:p2");
    expect(db.s.events.map((e) => e.hotmartEventId).sort()).toEqual(
      ["import:A0:APPROVED", "import:A1:APPROVED", "import:C1:APPROVED", "import:C2:APPROVED", "import:R1:REFUNDED", "import:S2:CANCELLATION"].sort()
    );
    // Club: assinatura achada pela transação ou pelo e-mail.
    const c1 = db.s.events.find((e) => e.hotmartEventId === "import:C1:APPROVED")!.payload as { data: { subscription: { subscriber: { code: string } } } };
    expect(c1.data.subscription.subscriber.code).toBe("S1");
    expect(db.s.job.result).toEqual({
      preview: {
        events: 6,
        contacts: { new: 3, existing: 1 }, // ana existe; bia, caio, duda novos
        deals: { new: 4, existing: 1 }, // A0 já tem card; A1, R1, S1, S2
        sales: { new: 4, existing: 1 },
      },
    });
    expect(applied.calls).toEqual([]); // prévia não escreve no CRM

    db.bulkJob.findFirst.mockResolvedValueOnce({ ...db.s.job } as never);
    expect(await confirmImport("o1")).toBe(true);
    expect(db.s.job).toMatchObject({ status: "queued", options: { phase: "apply" }, processed: 0 });
    await runUntil("completed");
    expect(applied.calls.map((c) => c.event)).toEqual([
      "PURCHASE_APPROVED", "PURCHASE_APPROVED", "PURCHASE_REFUNDED", "PURCHASE_APPROVED", "PURCHASE_APPROVED", "SUBSCRIPTION_CANCELLATION",
    ]);
    expect(applied.calls.every((c) => c.origin === "importacao" && c.teste === true)).toBe(true);
    expect(db.s.events.every((e) => e.result === "ok")).toBe(true);
    expect(db.s.job).toMatchObject({ status: "completed", processed: 6, updated: 6 });
  });

  it("rodar de novo não duplica eventos", async () => {
    await startImport("o1", { from: "2020-01-01", to: "2025-12-31" });
    await runUntil("awaiting_confirmation");
    const first = db.s.events.length;
    db.s.job = { ...db.s.job, options: { ...(db.s.job.options as object), phase: "fetch" }, cursor: "", buffer: "", total: 0, status: "queued" };
    await runUntil("awaiting_confirmation");
    expect(db.s.events).toHaveLength(first);
    expect((db.s.job.result as { preview: { events: number } }).preview.events).toBe(first);
  });

  it("prévia acha contato pelo CPF quando o e-mail não acha", async () => {
    db.s.events = [{
      id: "e0", orgId: "o1", hotmartEventId: "import:X:APPROVED", result: "pending", createdAt: new Date(),
      payload: { event: "PURCHASE_APPROVED", data: { product: { id: 111 }, buyer: { email: "novo@x.com", document: "123.456.789-01" }, purchase: { transaction: "X", status: "APPROVED" } } },
    }];
    db.s.contacts = [{ email: "velho@x.com", customFields: { cpf_cnpj: "12345678901" } }];
    const p = await countPreview("o1", products, { cpf_cnpj: "cpf_cnpj" });
    expect(p.contacts).toEqual({ new: 0, existing: 1 });
  });

  it("cancelar tira a fila pendente da importação e mantém o resto", async () => {
    db.bulkJob.findFirst.mockResolvedValueOnce({ id: "j1", status: "awaiting_confirmation" } as never);
    db.s.events = [
      { id: "a", orgId: "o1", hotmartEventId: "import:A:APPROVED", result: "pending", createdAt: new Date(), payload: {} },
      { id: "b", orgId: "o1", hotmartEventId: "import:B:APPROVED", result: "ok", createdAt: new Date(), payload: {} },
      { id: "c", orgId: "o1", hotmartEventId: "hook-1", result: "pending", createdAt: new Date(), payload: {} },
    ];
    expect(await cancelImport("o1")).toBe(true);
    expect(db.s.events.map((e) => e.id)).toEqual(["b", "c"]);
    expect(db.s.job.status).toBe("canceled");
  });
});
