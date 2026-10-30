// ---------------------------------------------------------------------------
// Meta Ads (M2): regras puras da importação de gasto. Sem "server-only": a
// tela usa os rótulos. Spec: docs/superpowers/specs/2026-10-29-marketing-m2-meta-ads-design.md
// ---------------------------------------------------------------------------

import { normalizeUtm } from "./touch";

/** Fonte das linhas de campanha da Meta na aba (a mesma utm_source sugerida na M1). */
export const META_SOURCE = "facebook";

export const INSIGHT_FIELDS = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions";

const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped"]);
const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";

export interface AdDay {
  date: string; // YYYY-MM-DD, no fuso da conta
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversations: number;
}

const int = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : v == null ? "" : String(v).slice(0, 300));

/* eslint-disable @typescript-eslint/no-explicit-any -- resposta da Graph */
/** Uma linha do /insights (level=ad, time_increment=1). Gasto vem como texto decimal na moeda da conta. */
export function parseInsightRow(row: any): AdDay | null {
  if (!row?.ad_id || !row?.date_start) return null;
  let leads = 0;
  let conversations = 0;
  for (const a of Array.isArray(row.actions) ? row.actions : []) {
    if (LEAD_ACTIONS.has(a?.action_type)) leads += int(a.value);
    else if (a?.action_type === CONVERSATION_ACTION) conversations += int(a.value);
  }
  return {
    date: String(row.date_start).slice(0, 10),
    campaignId: str(row.campaign_id),
    campaignName: str(row.campaign_name),
    adsetId: str(row.adset_id),
    adsetName: str(row.adset_name),
    adId: str(row.ad_id),
    adName: str(row.ad_name),
    spendCents: Math.round(Number(row.spend ?? 0) * 100) || 0,
    impressions: int(row.impressions),
    clicks: int(row.clicks),
    leads,
    conversations,
  };
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Janela da próxima leitura: na primeira vez, os últimos 30 dias; depois, desde
 * 2 dias antes do último dia completo (a Meta ainda corrige o gasto recente).
 */
export function syncWindow(syncedThrough: string | null, today: string): { since: string; until: string } {
  const since = syncedThrough ? addDays(syncedThrough, -2) : addDays(today, -29);
  return { since: since > today ? today : since, until: today };
}

/** Linha da aba para uma campanha da Meta: facebook + nome normalizado como UTM. */
export function metaCampaignKey(campaignName: string): { source: string; campaign: string } {
  return { source: META_SOURCE, campaign: normalizeUtm(campaignName) ?? "" };
}
