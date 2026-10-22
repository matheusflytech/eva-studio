import "server-only";
import { INSTAGRAM_GRAPH } from "@/lib/server/meta-graph";

// Campos que a Eva usa: DM (inclui resposta/menção em story), botões,
// reações e comentários. Sem isso a Meta não manda nada — antes era preciso
// marcar à mão no painel do app.
export const INSTAGRAM_FIELDS = ["messages", "messaging_postbacks", "message_reactions", "comments"];

export async function assinarEventosInstagram(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken.startsWith("IG")) {
    return { ok: false, error: "Conexão feita pelo Facebook: assine os campos na Página (painel do app Meta)." };
  }
  try {
    const res = await fetch(`${INSTAGRAM_GRAPH}/me/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: INSTAGRAM_FIELDS.join(","), access_token: accessToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `A Meta respondeu ${res.status}: ${await res.text().catch(() => "")}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}
