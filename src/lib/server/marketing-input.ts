import "server-only";
import { dataExiste } from "@/lib/custom-fields";
import { normalizeUtm } from "@/lib/marketing/touch";

// Validação do que a aba Marketing manda (investimento e links rastreados).

export interface SpendInput {
  source: string;
  campaign: string;
  from: Date;
  to: Date;
  amountCents: number;
  note: string;
}

export function parseSpend(b: Record<string, unknown>): SpendInput | { error: string } {
  const source = normalizeUtm(b.source);
  if (!source) return { error: "Informe a fonte (ex.: facebook, google)." };
  const from = typeof b.from === "string" ? b.from : "";
  const to = typeof b.to === "string" ? b.to : "";
  if (!dataExiste(from) || !dataExiste(to)) return { error: "Informe as datas do período." };
  if (from > to) return { error: "A data inicial vem depois da final." };
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 100_000_000_000) return { error: "Informe um valor maior que zero." };
  return {
    source,
    campaign: normalizeUtm(b.campaign) ?? "",
    from: new Date(`${from}T00:00:00Z`),
    to: new Date(`${to}T00:00:00Z`),
    amountCents,
    note: typeof b.note === "string" ? b.note.trim().slice(0, 500) : "",
  };
}

export interface LinkInput {
  name: string;
  phone: string;
  agentId: string | null;
  message: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

export function parseLink(b: Record<string, unknown>): LinkInput | { error: string } {
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  if (!name) return { error: "Dê um nome ao link." };
  const phone = typeof b.phone === "string" ? b.phone.replace(/\D/g, "") : "";
  if (phone.length < 10 || phone.length > 15) return { error: "Informe o número do WhatsApp com DDI e DDD (ex.: 5511999990000)." };
  return {
    name,
    phone,
    agentId: typeof b.agentId === "string" && b.agentId ? b.agentId : null,
    message: typeof b.message === "string" ? b.message.trim().slice(0, 500) : "",
    utmSource: normalizeUtm(b.utmSource),
    utmMedium: normalizeUtm(b.utmMedium),
    utmCampaign: normalizeUtm(b.utmCampaign),
    utmContent: normalizeUtm(b.utmContent),
    utmTerm: normalizeUtm(b.utmTerm),
  };
}
