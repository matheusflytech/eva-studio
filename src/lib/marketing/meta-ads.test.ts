import { describe, expect, it } from "vitest";
import { metaCampaignKey, parseInsightRow, syncWindow } from "./meta-ads";

describe("parseInsightRow", () => {
  it("gasto decimal vira centavos; leads e conversas saem de actions", () => {
    const r = parseInsightRow({
      date_start: "2026-10-20",
      campaign_id: "c1",
      campaign_name: "Black Friday",
      adset_id: "s1",
      adset_name: "Público A",
      ad_id: "a1",
      ad_name: "Vídeo 1",
      spend: "12.34",
      impressions: "1000",
      clicks: "25",
      actions: [
        { action_type: "lead", value: "3" },
        { action_type: "onsite_conversion.lead_grouped", value: "1" },
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" },
        { action_type: "link_click", value: "40" },
      ],
    });
    expect(r).toEqual({
      date: "2026-10-20", campaignId: "c1", campaignName: "Black Friday", adsetId: "s1", adsetName: "Público A",
      adId: "a1", adName: "Vídeo 1", spendCents: 1234, impressions: 1000, clicks: 25, leads: 4, conversations: 7,
    });
  });

  it("sem anúncio ou dia: ignora; sem gasto: zero", () => {
    expect(parseInsightRow({ date_start: "2026-10-20" })).toBeNull();
    expect(parseInsightRow({ ad_id: "a1", date_start: "2026-10-20" })?.spendCents).toBe(0);
  });
});

describe("syncWindow", () => {
  it("primeira vez: 30 dias", () => expect(syncWindow(null, "2026-10-29")).toEqual({ since: "2026-09-30", until: "2026-10-29" }));
  it("depois: 2 dias antes do último completo", () => expect(syncWindow("2026-10-28", "2026-10-29")).toEqual({ since: "2026-10-26", until: "2026-10-29" }));
});

describe("metaCampaignKey", () => {
  it("nome da campanha normalizado como UTM", () => expect(metaCampaignKey("  Black Friday ")).toEqual({ source: "facebook", campaign: "black friday" }));
});
