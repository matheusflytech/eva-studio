import { sha256Hex } from "./assinatura";
import type { KvMinimo, Origem } from "./tipos";

// A Meta re-tenta por até 7 dias; o dedupe precisa lembrar pelo menos isso.
export const TTL_DEDUPE_SEGUNDOS = 7 * 24 * 60 * 60;

/* eslint-disable @typescript-eslint/no-explicit-any -- payloads externos, lidos com cuidado */

/**
 * Ids que identificam o conteúdo de um POST da Meta. Um POST pode trazer
 * vários eventos; a chave é o conjunto deles (ordenado), então a reentrega do
 * mesmo lote cai na mesma chave.
 *
 * - WhatsApp: messages[].id (wamid) e statuses[].id + status (o mesmo wamid
 *   passa por sent → delivered → read; cada transição é um evento diferente).
 * - Instagram/Messenger: messaging[].message.mid; postback sem mid usa
 *   remetente + timestamp.
 * - Comentários: value.id. Templates: campo + WABA + id do modelo + evento.
 */
export function idsDaMeta(corpo: any): string[] {
  const ids: string[] = [];
  for (const entry of Array.isArray(corpo?.entry) ? corpo.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value ?? {};
      for (const m of Array.isArray(v.messages) ? v.messages : []) if (m?.id) ids.push(`m:${m.id}`);
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) if (s?.id) ids.push(`s:${s.id}:${s.status ?? ""}`);
      if (change?.field === "comments" && v.id) ids.push(`c:${v.id}`);
      if (v.message_template_id) ids.push(`t:${change.field}:${entry?.id ?? ""}:${v.message_template_id}:${v.event ?? ""}`);
    }
    for (const ev of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (ev?.message?.mid) ids.push(`mid:${ev.message.mid}`);
      else if (ev?.postback) ids.push(`pb:${ev.sender?.id ?? ""}:${ev.timestamp ?? ""}:${ev.postback.payload ?? ""}`);
    }
  }
  return [...new Set(ids)].sort();
}

/**
 * Chave de dedupe por origem. Sem id reconhecível, cai no hash do corpo cru —
 * a reentrega idêntica ainda é pega, e um evento novo nunca é descartado.
 */
export async function chaveDeDedupe(origem: Origem, agentId: string | undefined, corpoCru: string): Promise<string> {
  let json: any = null;
  try {
    json = JSON.parse(corpoCru);
  } catch {
    // corpo não-JSON: segue com o hash
  }

  if (origem === "telegram" && json && typeof json.update_id === "number") {
    // update_id é único por bot; o bot é do agente da URL.
    return `tg:${agentId ?? ""}:${json.update_id}`;
  }
  if (origem === "meta" && json) {
    const ids = idsDaMeta(json);
    if (ids.length > 0) return `meta:${await sha256Hex(ids.join("|"))}`;
  }
  return `${origem}:${agentId ?? "-"}:h:${await sha256Hex(corpoCru)}`;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * O KV é eventualmente consistente (até ~60 s entre regiões) e get+put não é
 * atômico: isto barra a imensa maioria das reentregas, não 100%. O app
 * continua com o próprio dedupe (isFirstDelivery na rota da Meta) como
 * segunda linha. Dedupe forte, se um dia precisar: Durable Object por chave.
 */
export async function jaVisto(kv: KvMinimo, chave: string): Promise<boolean> {
  return (await kv.get(`d:${chave}`)) !== null;
}

export async function marcarVisto(kv: KvMinimo, chave: string): Promise<void> {
  await kv.put(`d:${chave}`, "1", { expirationTtl: TTL_DEDUPE_SEGUNDOS });
}
