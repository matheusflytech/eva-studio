import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  touchpoint: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  trackedLink: { findFirst: vi.fn() },
  linkClick: { findFirst: vi.fn(), update: vi.fn() },
  deal: { findMany: vi.fn() },
  dealOrigin: { create: vi.fn(), findMany: vi.fn() },
  sale: { findMany: vi.fn() },
  marketingSpend: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { dealAttribution, marketingSummary, recordInboundTouches, recordTouch } from "./marketing";

const AT = new Date("2026-10-20T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.touchpoint.findFirst.mockResolvedValue(null);
  db.touchpoint.create.mockResolvedValue({ id: "tp-new" });
  db.deal.findMany.mockResolvedValue([]);
});

describe("recordTouch", () => {
  it("não repete o mesmo toque em 24 h", async () => {
    db.touchpoint.findFirst.mockResolvedValue({ id: "tp-old" });
    expect(await recordTouch("o1", "c1", { channel: "site", utmSource: "Google", at: AT })).toBe("tp-old");
    expect(db.touchpoint.create).not.toHaveBeenCalled();
    expect(db.touchpoint.findFirst.mock.calls[0][0].where).toMatchObject({ channel: "site", utmSource: "google", linkId: null });
  });

  it("grava normalizado, decide o pago e completa negócio recente sem origem", async () => {
    db.deal.findMany.mockResolvedValue([{ id: "d1", createdAt: new Date(AT.getTime() + 1000) }]);
    db.touchpoint.findMany.mockResolvedValue([{ id: "tp-new", at: AT, paid: true }]);
    await recordTouch("o1", "c1", { channel: "site", utmSource: " Facebook ", utmMedium: "CPC", at: AT });
    expect(db.touchpoint.create.mock.calls[0][0].data).toMatchObject({ utmSource: "facebook", utmMedium: "cpc", paid: true, at: AT });
    expect(db.dealOrigin.create).toHaveBeenCalledWith({ data: { dealId: "d1", orgId: "o1", touchpointId: "tp-new", firstTouchpointId: "tp-new" } });
  });
});

describe("recordInboundTouches", () => {
  it("ref: CODE de link do contrato grava whatsapp_link com as UTMs e liga o clique", async () => {
    db.trackedLink.findFirst.mockResolvedValue({ id: "l1", utmSource: "instagram", utmMedium: "bio", utmCampaign: "bf", utmContent: null, utmTerm: null });
    db.linkClick.findFirst.mockResolvedValue({ id: "k1", gclid: null, fbclid: "FB", referrer: null });
    await recordInboundTouches({ orgId: "o1", contactId: "c1", text: "Oi (ref: ABC234)", at: AT });
    expect(db.trackedLink.findFirst).toHaveBeenCalledWith({ where: { orgId: "o1", code: "ABC234" } });
    expect(db.linkClick.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { matchedContactId: "c1" } });
    expect(db.touchpoint.create.mock.calls[0][0].data).toMatchObject({ channel: "whatsapp_link", linkId: "l1", utmCampaign: "bf", fbclid: "FB", paid: true });
  });

  it("código de outro contrato não grava nada", async () => {
    db.trackedLink.findFirst.mockResolvedValue(null);
    await recordInboundTouches({ orgId: "o1", contactId: "c1", text: "ref: ABC234", at: AT });
    expect(db.touchpoint.create).not.toHaveBeenCalled();
  });

  it("toque do canal (widget/anúncio) é gravado com a hora da mensagem", async () => {
    await recordInboundTouches({ orgId: "o1", contactId: "c1", text: "oi", touch: { channel: "ad_whatsapp", adId: "9", paid: true }, at: AT });
    expect(db.touchpoint.create.mock.calls[0][0].data).toMatchObject({ channel: "ad_whatsapp", adId: "9", paid: true, at: AT });
  });
});

describe("dealAttribution", () => {
  it("último pago antes da criação e o primeiro toque", async () => {
    db.touchpoint.findMany.mockResolvedValue([
      { id: "a", at: new Date("2026-10-01"), paid: false },
      { id: "b", at: new Date("2026-10-02"), paid: true },
      { id: "c", at: new Date("2026-10-03"), paid: false },
    ]);
    expect(await dealAttribution("c1", AT)).toEqual({ touchpointId: "b", firstTouchpointId: "a" });
  });
});

describe("marketingSummary", () => {
  it("CPL, CAC, ROAS e % com origem; venda da Hotmart do mesmo negócio não conta duas vezes", async () => {
    const fb = { id: "t1", channel: "site", utmSource: "facebook", utmCampaign: "bf" };
    db.touchpoint.findMany.mockResolvedValueOnce([{ ...fb, at: AT }, { id: "t2", channel: "manual", utmSource: "indicacao", utmCampaign: null, at: AT }]);
    db.deal.findMany
      .mockResolvedValueOnce([
        { id: "d1", name: "A", origin: { touchpoint: fb } },
        { id: "d2", name: "B", origin: null },
      ])
      .mockResolvedValueOnce([{ id: "d1", name: "A", amountCents: 50000, origin: { touchpoint: fb } }]);
    db.sale.findMany.mockResolvedValue([{ amountBrlCents: 50000, contactId: "c1", dealId: "d1", approvedAt: AT }]);
    db.marketingSpend.findMany.mockResolvedValue([
      { source: "facebook", campaign: "bf", from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T00:00:00Z"), amountCents: 10000 },
    ]);
    const s = await marketingSummary("o1", "2026-10-01", "2026-10-31");
    const r = s.rows.find((x) => x.source === "facebook")!;
    expect(r).toMatchObject({ leads: 1, deals: 1, won: 1, revenueCents: 50000, spendCents: 10000, cplCents: 10000, cacCents: 10000, roas: 5 });
    expect(s.totals).toMatchObject({ deals: 2, dealsWithOrigin: 1, originPct: 0.5, revenueCents: 50000 });
    expect(s.rows.at(-1)!.source).toBeNull();
  });
});
