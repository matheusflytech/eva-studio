// ---------------------------------------------------------------------------
// Origem de marketing (M1): regras puras de toque, atribuição e custo.
// Sem "server-only": a tela usa os mesmos rótulos e o script do widget repete
// a mesma captura. Spec: docs/superpowers/specs/2026-10-29-marketing-origem-design.md
// ---------------------------------------------------------------------------

export const TOUCH_CHANNELS = ["site", "whatsapp_link", "ad_whatsapp", "ad_instagram", "ad_messenger", "hotmart", "manual"] as const;
export type TouchChannel = (typeof TOUCH_CHANNELS)[number];

export const CHANNEL_LABEL: Record<TouchChannel, string> = {
  site: "Site",
  whatsapp_link: "Link de WhatsApp",
  ad_whatsapp: "Anúncio → WhatsApp",
  ad_instagram: "Anúncio → Instagram",
  ad_messenger: "Anúncio → Messenger",
  hotmart: "Hotmart",
  manual: "Manual",
};

/** Origens da lista "Origem" do contato/negócio (toque manual). */
export const MANUAL_SOURCES: { value: string; label: string }[] = [
  { value: "indicacao", label: "Indicação" },
  { value: "evento", label: "Evento" },
  { value: "organico", label: "Orgânico" },
  { value: "outro", label: "Outro" },
];

export const UTM_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "utmId"] as const;
export const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "fbc", "fbp", "ctwaClid", "adId"] as const;
const OTHER_KEYS = ["linkId", "landingUrl", "referrer"] as const;
type TextKey = (typeof UTM_KEYS)[number] | (typeof CLICK_KEYS)[number] | (typeof OTHER_KEYS)[number];

export type TouchFields = Partial<Record<TextKey, string | null>>;

export interface TouchInput extends TouchFields {
  channel: TouchChannel;
  at?: Date;
  /** Sem valor: decide por `isPaid`. */
  paid?: boolean;
  raw?: Record<string, unknown>;
}

const MAX_UTM = 200;
const MAX_TEXT = 500;

/** UTM: minúsculas, sem espaço nas pontas, vazio vira null. */
export function normalizeUtm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().slice(0, MAX_UTM);
  return s || null;
}

/** Limpa o que veio de fora (widget, link, Hotmart): só texto, UTMs normalizadas. */
export function cleanTouch(input: unknown): TouchFields {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: TouchFields = {};
  for (const k of UTM_KEYS) {
    const v = normalizeUtm(o[k]);
    if (v) out[k] = v;
  }
  for (const k of [...CLICK_KEYS, ...OTHER_KEYS]) {
    const v = typeof o[k] === "string" ? (o[k] as string).trim().slice(0, MAX_TEXT) : "";
    if (v) out[k] = v;
  }
  return out;
}

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "ads", "display", "cpm"]);

/** Pago: tem id de clique/anúncio ou utm_medium de mídia paga. */
export function isPaid(t: TouchFields): boolean {
  if (t.gclid || t.gbraid || t.wbraid || t.fbclid || t.ctwaClid || t.adId) return true;
  return !!t.utmMedium && PAID_MEDIUMS.has(t.utmMedium.toLowerCase());
}

interface TouchRef {
  id: string;
  at: Date;
  paid: boolean;
}

/** Último toque pago até a criação do negócio; sem pago, o último; nenhum antes: null. */
export function pickTouchpoint(touches: TouchRef[], dealCreatedAt: Date): string | null {
  const before = touches.filter((t) => t.at.getTime() <= dealCreatedAt.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  const paid = before.filter((t) => t.paid);
  return (paid.at(-1) ?? before.at(-1))?.id ?? null;
}

export function firstTouch(touches: TouchRef[]): string | null {
  return [...touches].sort((a, b) => a.at.getTime() - b.at.getTime())[0]?.id ?? null;
}

export interface SpendRow {
  source: string;
  campaign: string;
  from: string; // YYYY-MM-DD
  to: string;
  amountCents: number;
}

const DAY = 86_400_000;
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);

/** Custo de uma fonte/campanha na janela [de, ate], rateado por dia quando o lançamento cruza a janela. */
export function spendFor(spends: SpendRow[], source: string, campaign: string, de: string, ate: string): number {
  const a = dayNumber(de);
  const b = dayNumber(ate);
  let total = 0;
  for (const s of spends) {
    if (s.source !== source || s.campaign !== campaign) continue;
    const from = dayNumber(s.from);
    const to = dayNumber(s.to);
    const overlap = Math.min(b, to) - Math.max(a, from) + 1;
    if (overlap <= 0) continue;
    total += (s.amountCents * overlap) / (to - from + 1);
  }
  return Math.round(total);
}

// Sem 0/O, 1/I/L: o cliente pode ter de ler o código em voz alta.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newCode(len: number, rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/** `ref: CODE` no texto da mensagem (6 letras = link; 8 = visita do site). */
export function extractRef(text: string | undefined | null): string | null {
  const m = text?.match(/\bref:\s*([A-Z2-9]{6,8})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function waUrl(phone: string, message: string, code: string): string {
  const text = `${message.trim()} (ref: ${code})`.trim();
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload da Meta */
/**
 * `referral` da 1ª mensagem vinda de anúncio (Click to WhatsApp / Messenger /
 * Instagram). Sem id de anúncio nem ctwa_clid: não é anúncio, nada a gravar.
 */
export function touchFromMetaReferral(channel: string, referral: any): TouchInput | null {
  if (!referral || typeof referral !== "object") return null;
  const adId = String(referral.source_id ?? referral.ad_id ?? "").trim() || null;
  const ctwaClid = typeof referral.ctwa_clid === "string" ? referral.ctwa_clid : null;
  const isAd = !!(ctwaClid || (adId && (referral.source_type === "ad" || referral.ad_id || referral.source === "ADS")));
  if (!isAd) return null;
  const ch: TouchChannel = channel === "instagram" ? "ad_instagram" : channel === "messenger" ? "ad_messenger" : "ad_whatsapp";
  return {
    channel: ch,
    paid: true,
    adId,
    ctwaClid,
    utmSource: channel === "instagram" ? "instagram" : "facebook",
    utmMedium: "paid",
    landingUrl: typeof referral.source_url === "string" ? referral.source_url.slice(0, MAX_TEXT) : null,
    raw: { referral },
  };
}
