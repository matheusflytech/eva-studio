import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  cleanTouch,
  extractRef,
  firstTouch,
  isPaid,
  pickTouchpoint,
  spendFor,
  type SpendRow,
  type TouchInput,
} from "@/lib/marketing/touch";

// Origem de marketing (M1): grava toques, liga o "ref: CODE" da mensagem ao
// link/visita, congela a origem do negócio e monta o resumo da aba Marketing.
// Nada aqui chama serviço de fora: só lemos o que já chegou.

const DEDUPE_MS = 24 * 3600_000;
const DEDUPE_KEYS = ["utmSource", "utmCampaign", "linkId", "adId", "gclid", "fbclid", "ctwaClid"] as const;

/** Grava um toque. O mesmo toque (canal + chaves) em 24 h não repete: devolve o que já existe. */
export async function recordTouch(orgId: string, contactId: string, input: TouchInput): Promise<string> {
  const fields = cleanTouch(input);
  const at = input.at ?? new Date();
  const same = await prisma.touchpoint.findFirst({
    where: {
      orgId,
      contactId,
      channel: input.channel,
      at: { gte: new Date(at.getTime() - DEDUPE_MS) },
      ...Object.fromEntries(DEDUPE_KEYS.map((k) => [k, fields[k] ?? null])),
    },
    select: { id: true },
  });
  if (same) return same.id;
  const created = await prisma.touchpoint.create({
    data: {
      orgId,
      contactId,
      at,
      channel: input.channel,
      paid: input.paid ?? isPaid(fields),
      ...fields,
      raw: (input.raw ?? {}) as object,
    },
    select: { id: true },
  });
  // O bloco de CRM do fluxo cria o negócio antes de o toque da mesma mensagem existir.
  await attachRecentDeals(orgId, contactId, at);
  return created.id;
}

/** Origem do negócio pelos toques do contato principal até a criação. */
export async function dealAttribution(contactId: string, createdAt: Date) {
  const touches = await prisma.touchpoint.findMany({
    where: { contactId, at: { lte: createdAt } },
    select: { id: true, at: true, paid: true },
  });
  return { touchpointId: pickTouchpoint(touches, createdAt), firstTouchpointId: firstTouch(touches) };
}

/** Congela a origem de um negócio novo. Nunca derruba quem chamou. */
export async function freezeDealOrigin(orgId: string, dealId: string, contactId: string, createdAt: Date): Promise<void> {
  try {
    const o = await dealAttribution(contactId, createdAt);
    if (!o.touchpointId && !o.firstTouchpointId) return;
    await prisma.dealOrigin.create({ data: { dealId, orgId, ...o } });
  } catch (e) {
    console.error("[marketing] falha ao congelar a origem do negócio", e instanceof Error ? e.message : e);
  }
}

/** Negócios do contato criados desde `since` e ainda sem origem: recebem a origem agora. */
export async function attachRecentDeals(orgId: string, contactId: string, since: Date): Promise<void> {
  const deals = await prisma.deal.findMany({
    where: { orgId, createdAt: { gte: since }, origin: null, contacts: { some: { contactId } } },
    select: { id: true, createdAt: true },
  });
  for (const d of deals) await freezeDealOrigin(orgId, d.id, contactId, d.createdAt);
}

/**
 * Mensagem que chegou de um contato: grava o toque que o canal trouxe (widget,
 * anúncio) e o do "ref: CODE" no texto (link rastreado ou visita do site).
 */
export async function recordInboundTouches(a: { orgId: string; contactId: string; text?: string; touch?: TouchInput; at: Date }): Promise<void> {
  if (a.touch) await recordTouch(a.orgId, a.contactId, { ...a.touch, at: a.at });

  const code = extractRef(a.text);
  if (!code) return;
  if (code.length === 6) {
    const link = await prisma.trackedLink.findFirst({ where: { orgId: a.orgId, code } });
    if (!link) return;
    // O último clique ainda sem contato é o desta pessoa (melhor palpite sem cookie no WhatsApp).
    const click = await prisma.linkClick.findFirst({
      where: { linkId: link.id, matchedContactId: null, at: { lte: a.at, gte: new Date(a.at.getTime() - 7 * DEDUPE_MS) } },
      orderBy: { at: "desc" },
    });
    if (click) await prisma.linkClick.update({ where: { id: click.id }, data: { matchedContactId: a.contactId } });
    await recordTouch(a.orgId, a.contactId, {
      channel: "whatsapp_link",
      at: a.at,
      linkId: link.id,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      utmContent: link.utmContent,
      utmTerm: link.utmTerm,
      gclid: click?.gclid,
      fbclid: click?.fbclid,
      referrer: click?.referrer,
    });
    return;
  }
  // Visita do site que saiu para o WhatsApp pelo link reescrito do widget.
  const visit = await prisma.linkClick.findFirst({ where: { orgId: a.orgId, code, linkId: null } });
  if (!visit) return;
  if (!visit.matchedContactId) await prisma.linkClick.update({ where: { id: visit.id }, data: { matchedContactId: a.contactId } });
  await recordTouch(a.orgId, a.contactId, { ...cleanTouch(visit.raw), channel: "site", at: a.at });
}

// --- Resumo da aba Marketing ------------------------------------------------

export interface MarketingRow {
  /** null = sem origem conhecida. */
  source: string | null;
  campaign: string;
  spendCents: number;
  leads: number;
  deals: number;
  won: number;
  revenueCents: number;
  cplCents: number | null;
  cacCents: number | null;
  roas: number | null;
  dealList: { id: string; name: string }[];
}

export interface MarketingSummary {
  from: string;
  to: string;
  totals: Omit<MarketingRow, "source" | "campaign" | "dealList"> & { dealsWithOrigin: number; originPct: number | null };
  rows: MarketingRow[];
}

const TP_SELECT = { id: true, channel: true, utmSource: true, utmCampaign: true } as const;
type Tp = { id: string; channel: string; utmSource: string | null; utmCampaign: string | null };

/** Fonte da linha: a utm_source; sem ela, o canal (whatsapp_link, site...). */
const keyOf = (tp: Tp | null | undefined) => (tp ? { source: tp.utmSource ?? tp.channel, campaign: tp.utmCampaign ?? "" } : null);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function ratios(r: Pick<MarketingRow, "spendCents" | "leads" | "won" | "revenueCents">) {
  const per = (n: number) => (r.spendCents > 0 && n > 0 ? Math.round(r.spendCents / n) : null);
  return { cplCents: per(r.leads), cacCents: per(r.won), roas: r.spendCents > 0 ? r.revenueCents / r.spendCents : null };
}

/**
 * Período em datas de São Paulo. Lead = contato cujo 1º toque cai no período
 * (pela origem desse toque). Negócio = criado no período (origem congelada).
 * Venda = negócio ganho no período + venda Hotmart aprovada no período que não
 * é de um negócio já contado (sem isso a receita da Hotmart contaria duas vezes).
 */
export async function marketingSummary(orgId: string, from: string, to: string): Promise<MarketingSummary> {
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(`${to}T23:59:59.999-03:00`);
  const window = { gte: start, lte: end };

  // shortcut: 1º toque de cada contato do contrato lido inteiro; trocar por DISTINCT ON em SQL quando passar de ~50 mil contatos com toque.
  const [firsts, created, won, sales, spends] = await Promise.all([
    prisma.touchpoint.findMany({
      where: { orgId },
      distinct: ["contactId"],
      orderBy: [{ contactId: "asc" }, { at: "asc" }],
      select: { ...TP_SELECT, at: true },
    }),
    prisma.deal.findMany({
      where: { orgId, archivedAt: null, createdAt: window },
      select: { id: true, name: true, origin: { select: { touchpoint: { select: TP_SELECT } } } },
    }),
    prisma.deal.findMany({
      where: { orgId, archivedAt: null, closedAt: window, stage: { type: "won" } },
      select: { id: true, name: true, amountCents: true, origin: { select: { touchpoint: { select: TP_SELECT } } } },
    }),
    prisma.sale.findMany({
      where: { orgId, status: { in: ["approved", "complete"] }, approvedAt: window },
      select: { amountBrlCents: true, contactId: true, dealId: true, approvedAt: true },
    }),
    prisma.marketingSpend.findMany({
      where: { orgId, from: { lte: new Date(`${to}T00:00:00Z`) }, to: { gte: new Date(`${from}T00:00:00Z`) } },
      select: { source: true, campaign: true, from: true, to: true, amountCents: true },
    }),
  ]);

  const rows = new Map<string, MarketingRow>();
  const row = (k: { source: string | null; campaign: string }) => {
    const id = `${k.source ?? ""}|${k.campaign}`;
    let r = rows.get(id);
    if (!r) {
      r = { source: k.source, campaign: k.campaign, spendCents: 0, leads: 0, deals: 0, won: 0, revenueCents: 0, cplCents: null, cacCents: null, roas: null, dealList: [] };
      rows.set(id, r);
    }
    return r;
  };
  const NONE = { source: null, campaign: "" };

  for (const t of firsts) if (t.at >= start && t.at <= end) row(keyOf(t)!).leads++;

  let dealsWithOrigin = 0;
  for (const d of created) {
    const k = keyOf(d.origin?.touchpoint);
    if (k) dealsWithOrigin++;
    const r = row(k ?? NONE);
    r.deals++;
    if (r.dealList.length < 50) r.dealList.push({ id: d.id, name: d.name });
  }

  const wonIds = new Set(won.map((d) => d.id));
  for (const d of won) {
    const r = row(keyOf(d.origin?.touchpoint) ?? NONE);
    r.won++;
    r.revenueCents += d.amountCents;
  }

  // Venda sem negócio já contado: origem do negócio dela; senão a do contato na data da venda.
  const loose = sales.filter((s) => !s.dealId || !wonIds.has(s.dealId));
  const saleDealIds = [...new Set(loose.map((s) => s.dealId).filter((x): x is string => !!x))];
  const saleContactIds = [...new Set(loose.map((s) => s.contactId).filter((x): x is string => !!x))];
  const [saleOrigins, contactTouches] = await Promise.all([
    saleDealIds.length
      ? prisma.dealOrigin.findMany({ where: { dealId: { in: saleDealIds } }, select: { dealId: true, touchpoint: { select: TP_SELECT } } })
      : [],
    saleContactIds.length
      ? prisma.touchpoint.findMany({ where: { orgId, contactId: { in: saleContactIds } }, select: { ...TP_SELECT, contactId: true, at: true, paid: true } })
      : [],
  ]);
  const originOfDeal = new Map(saleOrigins.map((o) => [o.dealId, o.touchpoint]));
  for (const s of loose) {
    let tp: Tp | null | undefined = s.dealId ? originOfDeal.get(s.dealId) : null;
    if (!tp && s.contactId) {
      const mine = contactTouches.filter((t) => t.contactId === s.contactId);
      const id = pickTouchpoint(mine, s.approvedAt ?? end);
      tp = mine.find((t) => t.id === id);
    }
    const r = row(keyOf(tp) ?? NONE);
    r.won++;
    r.revenueCents += s.amountBrlCents;
  }

  const spendRows: SpendRow[] = spends.map((s) => ({ source: s.source, campaign: s.campaign, from: ymd(s.from), to: ymd(s.to), amountCents: s.amountCents }));
  for (const s of spendRows) row(s).spendCents = 0; // garante a linha; o valor sai do rateio abaixo
  for (const r of rows.values()) if (r.source !== null) r.spendCents = spendFor(spendRows, r.source, r.campaign, from, to);

  const list = [...rows.values()].map((r) => ({ ...r, ...ratios(r) }));
  const sum = (k: "spendCents" | "leads" | "deals" | "won" | "revenueCents") => list.reduce((n, r) => n + r[k], 0);
  const base = { spendCents: sum("spendCents"), leads: sum("leads"), deals: sum("deals"), won: sum("won"), revenueCents: sum("revenueCents") };
  list.sort((a, b) => (a.source === null ? 1 : b.source === null ? -1 : b.spendCents - a.spendCents || b.revenueCents - a.revenueCents || b.leads - a.leads));
  return {
    from,
    to,
    totals: { ...base, ...ratios(base), dealsWithOrigin, originPct: created.length ? dealsWithOrigin / created.length : null },
    rows: list,
  };
}
