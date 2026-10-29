import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { BulkJob, Prisma } from "@/generated/prisma/client";
import { comAtor } from "@/lib/server/eventos/barramento";
import { normalizeEvent } from "@/lib/hotmart/normalize";
import { targetKey, type FieldMap } from "@/lib/hotmart/fields";
import {
  IMPORT_PREFIX, IMPORTED_STATUSES, buyerOf, cancellationPayload, historyToPayload, subscriptionOf,
  type HistoryBuyer, type HistorySubscription,
} from "@/lib/hotmart/history";
import { applyEvent } from "./apply";
import { getPage, type ApiDeps } from "./api";
import { apiCredentialsOf, getConnection, type Products } from "./connection";

// ---------------------------------------------------------------------------
// Importação do histórico da Hotmart, como BulkJob no relógio (processar-jobs).
// Fases em `options.phase`:
//   fetch   -> lê a API (só GET) e grava cada venda como evento "import:<tx>:<STATUS>"
//              na fila da F1 (o @@unique do evento faz rodar de novo não duplicar);
//   preview -> conta o que seria criado, sem escrever no CRM, e para em
//              "awaiting_confirmation" esperando o OK no painel;
//   apply   -> aplica os eventos pendentes em ordem de data com o applyEvent de
//              sempre, sem disparar automação, webhook de saída nem sale.*.
// kind próprio ("hotmart_import"): com "import" a API v1 acharia que há uma
// importação dela em andamento.
// ---------------------------------------------------------------------------

export const IMPORT_KIND = "hotmart_import";
export const ACTIVE_STATUSES = ["queued", "processing", "awaiting_confirmation"];
const PAGE_SIZE = 100;
const APPLY_SLICE = 25;
const IN_CHUNK = 500;

export type Phase = "fetch" | "preview" | "apply";
export interface ImportOptions { phase: Phase; from: string; to: string; products: string[] }
interface Cursor { product: number; step: "subscriptions" | "users" | "history"; status: number; pageToken: string | null }
/** Estado entre rodadas do relógio, em `buffer`: assinaturas do produto e compradores do status atual. */
interface Lookup { subs: Record<string, HistorySubscription>; buyers: Record<string, HistoryBuyer> }
export interface Counts { new: number; existing: number }
export interface Preview { events: number; contacts: Counts; deals: Counts; sales: Counts }

export class ImportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Dia em São Paulo -> ms UTC (início ou fim do dia). */
const spMs = (day: string, end: boolean) => new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}-03:00`).getTime();
const importedWhere = (orgId: string) => ({ orgId, result: "pending", hotmartEventId: { startsWith: IMPORT_PREFIX } });

export async function activeImport(orgId: string) {
  return prisma.bulkJob.findFirst({ where: { orgId, kind: IMPORT_KIND, status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: "desc" } });
}

export async function startImport(orgId: string, range: { from: string; to: string }): Promise<BulkJob> {
  if (!DAY.test(range.from) || !DAY.test(range.to) || range.from > range.to) throw new ImportError("Período inválido.", 400);
  const c = await getConnection(orgId);
  if (!c || !apiCredentialsOf(c.secrets)) throw new ImportError("Salve as credenciais da API da Hotmart antes de importar.", 400);
  const products = Object.keys((c.products ?? {}) as object);
  if (!products.length) throw new ImportError("Ligue ao menos um produto a um funil antes de importar.", 400);
  if (await activeImport(orgId)) throw new ImportError("Já existe uma importação da Hotmart em andamento.", 409);
  const options: ImportOptions = { phase: "fetch", from: range.from, to: range.to, products };
  return prisma.bulkJob.create({ data: { orgId, kind: IMPORT_KIND, entity: "hotmart", status: "queued", options: options as object } });
}

/** Cancela: o que já foi aplicado fica; a fila pendente da importação sai. */
export async function cancelImport(orgId: string): Promise<boolean> {
  const job = await activeImport(orgId);
  if (!job) return false;
  await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "canceled", finishedAt: new Date(), lockedAt: null } });
  await prisma.hotmartEvent.deleteMany({ where: importedWhere(orgId) });
  return true;
}

/** OK do painel depois da prévia. */
export async function confirmImport(orgId: string): Promise<boolean> {
  const job = await activeImport(orgId);
  if (!job || job.status !== "awaiting_confirmation") return false;
  const options = { ...(job.options as unknown as ImportOptions), phase: "apply" as const };
  await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "queued", options: options as object, processed: 0 } });
  return true;
}

/** Passo do relógio. Devolve quantos itens andou. Sempre solta a trava ao sair. */
export async function processHotmartImport(job: BulkJob, hasTime: () => boolean, deps: ApiDeps = {}): Promise<number> {
  const options = job.options as unknown as ImportOptions;
  const c = await getConnection(job.orgId);
  const products = (c?.products ?? {}) as unknown as Products;
  if (!c) throw new ImportError("Conexão Hotmart removida.", 400);
  if (options.phase === "fetch") return fetchPhase(job, options, c.id, c.secrets, products, hasTime, deps);
  if (options.phase === "preview") return previewPhase(job, options, products, (c.fields ?? {}) as FieldMap);
  return applyPhase(job, products, (c.fields ?? {}) as FieldMap, hasTime);
}

async function canceled(id: string) {
  const j = await prisma.bulkJob.findUnique({ where: { id }, select: { status: true } });
  return !j || j.status === "canceled";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload externo */
function eventRow(orgId: string, connectionId: string, p: any) {
  const d = p.data ?? {};
  return {
    orgId, connectionId, hotmartEventId: String(p.id), event: String(p.event),
    productId: d.product?.id ? String(d.product.id) : null,
    transaction: d.purchase?.transaction ? String(d.purchase.transaction) : null,
    email: String(d.buyer?.email || d.subscriber?.email || "").trim().toLowerCase() || null,
    payload: p as object, result: "pending",
    // Data do evento na Hotmart: é a ordem em que a fase apply aplica.
    ...(p.creation_date ? { createdAt: new Date(Number(p.creation_date)) } : {}),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchPhase(job: BulkJob, options: ImportOptions, connectionId: string, secrets: string, products: Products, hasTime: () => boolean, deps: ApiDeps): Promise<number> {
  const creds = apiCredentialsOf(secrets);
  if (!creds) throw new ImportError("Credenciais da API da Hotmart removidas.", 400);
  const cur: Cursor = job.cursor ? JSON.parse(job.cursor) : { product: 0, step: "subscriptions", status: 0, pageToken: null };
  const look: Lookup = job.buffer ? JSON.parse(job.buffer) : { subs: {}, buyers: {} };
  const range = { start_date: spMs(options.from, false), end_date: spMs(options.to, true) };
  let total = job.total;
  let moved = 0;

  while (hasTime()) {
    if (await canceled(job.id)) return moved;
    if (cur.product >= options.products.length) {
      const next = { ...options, phase: "preview" as const };
      await prisma.bulkJob.update({ where: { id: job.id }, data: { options: next as object, cursor: "", buffer: "", total, lockedAt: null } });
      return moved;
    }
    const pid = options.products[cur.product];
    const rows: ReturnType<typeof eventRow>[] = [];
    let next: string | null = null;

    if (cur.step === "subscriptions") {
      if (products[pid]?.model !== "subscription") {
        Object.assign(cur, { step: "users", pageToken: null });
        continue;
      }
      const page = await getPage(creds, "/subscriptions", { product_id: pid, accession_date: range.start_date, max_results: PAGE_SIZE, page_token: cur.pageToken ?? undefined }, deps);
      for (const item of page.items) {
        const s = subscriptionOf(item);
        if (!s) continue;
        look.subs[`e:${s.email}`] = s;
        if (s.transaction) look.subs[`t:${s.transaction}`] = s;
        const p = cancellationPayload(s, pid);
        if (p) rows.push(eventRow(job.orgId, connectionId, p));
      }
      moved += page.items.length;
      next = page.nextPageToken;
      if (!next) Object.assign(cur, { step: "users", status: 0 });
    } else {
      const params = { ...range, product_id: pid, transaction_status: IMPORTED_STATUSES[cur.status], max_results: PAGE_SIZE, page_token: cur.pageToken ?? undefined };
      if (cur.step === "users") {
        const page = await getPage(creds, "/sales/users", params, deps);
        for (const item of page.items) {
          const b = buyerOf(item);
          if (b) look.buyers[b[0]] = b[1];
        }
        moved += page.items.length;
        next = page.nextPageToken;
        if (!next) cur.step = "history";
      } else {
        const page = await getPage(creds, "/sales/history", params, deps);
        for (const item of page.items) {
          const tx = String(item?.purchase?.transaction ?? "");
          const email = String(item?.buyer?.email ?? "").trim().toLowerCase();
          const p = historyToPayload(item, look.buyers[tx], look.subs[`t:${tx}`] ?? look.subs[`e:${email}`]);
          if (p) rows.push(eventRow(job.orgId, connectionId, p));
        }
        moved += page.items.length;
        next = page.nextPageToken;
        if (!next) {
          look.buyers = {};
          if (cur.status + 1 < IMPORTED_STATUSES.length) Object.assign(cur, { step: "users", status: cur.status + 1 });
          else {
            Object.assign(cur, { product: cur.product + 1, step: "subscriptions", status: 0 });
            look.subs = {};
          }
        }
      }
    }
    cur.pageToken = next;
    if (rows.length) total += (await prisma.hotmartEvent.createMany({ data: rows, skipDuplicates: true })).count;
    await prisma.bulkJob.update({
      where: { id: job.id },
      data: { cursor: JSON.stringify(cur), buffer: JSON.stringify(look), total, processed: job.processed + moved, lockedAt: new Date() },
    });
  }
  await prisma.bulkJob.update({ where: { id: job.id }, data: { lockedAt: null } });
  return moved;
}

const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / IN_CHUNK) }, (_, i) => xs.slice(i * IN_CHUNK, (i + 1) * IN_CHUNK));

/** Conta o que a fase apply criaria. Só leitura no CRM. */
export async function countPreview(orgId: string, products: Products, map: FieldMap): Promise<Preview> {
  const events = await prisma.hotmartEvent.findMany({ where: importedWhere(orgId), select: { payload: true } });
  const people = new Map<string, string | null>(); // e-mail (ou cpf:<n>) -> cpf
  const keys = new Map<string, Set<string>>(); // origem da chave -> valores
  const txs = new Set<string>();
  for (const e of events) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo */
    const p = e.payload as any;
    const product = products[String(p?.data?.product?.id ?? "")];
    if (!product) continue;
    const n = normalizeEvent(p, product);
    if (n.email || n.cpf) people.set(n.email || `cpf:${n.cpf}`, n.cpf);
    if (n.key.value) keys.set(n.key.source, (keys.get(n.key.source) ?? new Set()).add(n.key.value));
    if (n.transaction && n.sale.status) txs.add(n.transaction);
  }

  // Contato: e-mail; senão CPF (a mesma busca do applyEvent).
  const emails = [...people.keys()].filter((k) => !k.startsWith("cpf:"));
  const found = new Set<string>();
  for (const part of chunks(emails)) {
    const rows = await prisma.contact.findMany({ where: { orgId, email: { in: part, mode: "insensitive" } }, select: { email: true } });
    for (const r of rows) if (r.email) found.add(r.email.toLowerCase());
  }
  const cpfKey = targetKey(map, "cpf_cnpj");
  const missingCpf = [...people].filter(([k, cpf]) => !found.has(k) && cpf).map(([k, cpf]) => [k, cpf!] as const);
  if (cpfKey && missingCpf.length) {
    for (const part of chunks(missingCpf)) {
      const rows = await prisma.contact.findMany({ where: { orgId, OR: part.map(([, cpf]) => ({ customFields: { path: [cpfKey], equals: cpf } })) }, select: { customFields: true } });
      const cpfs = new Set(rows.map((r) => String((r.customFields as Record<string, unknown>)?.[cpfKey] ?? "")));
      for (const [k, cpf] of part) if (cpfs.has(cpf)) found.add(k);
    }
  }

  let dealsFound = 0;
  let dealsTotal = 0;
  for (const [source, values] of keys) {
    dealsTotal += values.size;
    for (const part of chunks([...values])) dealsFound += await prisma.externalRef.count({ where: { orgId, entity: "deal", source, externalId: { in: part } } });
  }
  let salesFound = 0;
  for (const part of chunks([...txs])) salesFound += await prisma.sale.count({ where: { orgId, platform: "hotmart", transaction: { in: part } } });

  return {
    events: events.length,
    contacts: { new: people.size - found.size, existing: found.size },
    deals: { new: dealsTotal - dealsFound, existing: dealsFound },
    sales: { new: txs.size - salesFound, existing: salesFound },
  };
}

async function previewPhase(job: BulkJob, options: ImportOptions, products: Products, map: FieldMap): Promise<number> {
  const preview = await countPreview(job.orgId, products, map);
  await prisma.bulkJob.update({
    where: { id: job.id },
    data: { status: preview.events ? "awaiting_confirmation" : "completed", ...(preview.events ? {} : { finishedAt: new Date() }), total: preview.events, result: { preview } as unknown as Prisma.InputJsonValue, lockedAt: null },
  });
  return 0;
}

async function applyPhase(job: BulkJob, products: Products, map: FieldMap, hasTime: () => boolean): Promise<number> {
  const count = { processed: job.processed, updated: job.updated, unchanged: job.unchanged, failed: job.failed };
  let moved = 0;
  while (hasTime()) {
    if (await canceled(job.id)) return moved;
    const batch = await prisma.hotmartEvent.findMany({ where: importedWhere(job.orgId), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: APPLY_SLICE });
    for (const ev of batch) {
      // Ator de teste: o evento do CRM fica gravado, mas não vai a automação nem a webhook de saída.
      const r = await comAtor({ tipo: "integracao", teste: true }, () => applyEvent(job.orgId, products, ev.payload, map, { origin: "importacao" }));
      await prisma.hotmartEvent.update({
        where: { id: ev.id },
        data: { result: r.result, detail: r.detail ?? null, contactId: r.contactId ?? null, dealId: r.dealId ?? null, processedAt: new Date() },
      });
      count.processed += 1;
      if (r.result === "ok") count.updated += 1;
      else if (r.result === "ignored") count.unchanged += 1;
      else count.failed += 1;
    }
    moved += batch.length;
    const done = batch.length < APPLY_SLICE;
    await prisma.bulkJob.update({
      where: { id: job.id },
      data: {
        ...count,
        ...(done ? { status: count.failed ? "completed_with_errors" : "completed", finishedAt: new Date(), lockedAt: null } : { lockedAt: new Date() }),
      },
    });
    if (done) return moved;
  }
  await prisma.bulkJob.update({ where: { id: job.id }, data: { lockedAt: null } });
  return moved;
}
