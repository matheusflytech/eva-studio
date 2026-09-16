import "server-only";

// Envio de e-mail via API da Resend (REST direta, sem SDK) — mesmo padrão
// "fetch puro" usado no resto do motor. Free tier: até 100 e-mails/dia,
// 3.000/mês, o suficiente pro uso inicial.
export async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body.slice(0, 300) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
