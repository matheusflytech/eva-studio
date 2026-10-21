import "server-only";

// Registro do webhook do bot do Telegram. A URL leva o id do agente
// (/api/webhooks/telegram/<agentId>): quando o bot passa para outro agente
// (Configurações → Canais), o webhook precisa ser registrado de novo.

export function webhookUrlDoTelegram(agentId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return `${base}/api/webhooks/telegram/${agentId}`;
}

/** Aponta o bot para o agente. ok=false traz a descrição do Telegram. */
export async function registrarWebhookDoTelegram(token: string, agentId: string): Promise<{ ok: boolean; erro: string | null }> {
  const url = webhookUrlDoTelegram(agentId);
  if (!url.startsWith("https://")) {
    return { ok: false, erro: "O Telegram só aceita webhook em HTTPS. Configure NEXT_PUBLIC_APP_URL com o domínio público do app." };
  }
  // O secret_token volta em todo update no header X-Telegram-Bot-Api-Secret-Token
  // — é assim que o webhook confere que a chamada veio mesmo do Telegram.
  const secret = process.env.INTERNAL_API_SECRET ?? "";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secret || undefined, allowed_updates: ["message", "callback_query"] }),
    });
    const hook = await res.json().catch(() => null);
    return hook?.ok ? { ok: true, erro: null } : { ok: false, erro: hook?.description ?? "Falha ao registrar webhook." };
  } catch {
    return { ok: false, erro: "O Telegram não respondeu." };
  }
}
