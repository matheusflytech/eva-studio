// ---------------------------------------------------------------------------
// Exemplos de chamada da API v1 (curl e JavaScript/fetch) montados a partir
// do método, do caminho e do corpo de exemplo do OpenAPI. Usado pelas páginas
// Integrações → API (visão geral e referência).
// ---------------------------------------------------------------------------

export interface ExampleRequest {
  method: string;
  /** URL completa, ex.: https://app.exemplo.com/api/v1/contacts?limit=50 */
  url: string;
  body?: unknown;
  /** Manda o header Idempotency-Key no exemplo. */
  idempotency?: boolean;
}

export function toCurl({ method, url, body, idempotency }: ExampleRequest): string {
  const lines = [`curl -X ${method} "${url}"`, `  -H "Authorization: Bearer evs_live_..."`];
  if (idempotency) lines.push(`  -H "Idempotency-Key: $(uuidgen)"`);
  if (body !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`);
    // Aspas simples no shell: ' vira '\''.
    lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}

export function toFetch({ method, url, body, idempotency }: ExampleRequest): string {
  const headers = [`    Authorization: \`Bearer \${process.env.EVA_API_KEY}\`,`];
  if (idempotency) headers.push(`    "Idempotency-Key": crypto.randomUUID(),`);
  if (body !== undefined) headers.push(`    "Content-Type": "application/json",`);
  const options = [`  method: "${method}",`, `  headers: {`, ...headers, `  },`];
  if (body !== undefined) options.push(`  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),`);
  return [
    `const res = await fetch("${url}", {`,
    ...options,
    `});`,
    `const json = await res.json();`,
    `if (!res.ok) throw new Error(\`\${json.error.code}: \${json.error.message}\`);`,
  ].join("\n");
}

/**
 * Conferência da assinatura do webhook, como mostrada na página. O teste roda
 * este mesmo texto contra o assinador de verdade (src/lib/server/webhooks/assinatura.ts).
 */
export const WEBHOOK_VERIFY_SNIPPET = `import crypto from "node:crypto";

// rawBody: o corpo exatamente como chegou (texto), antes de JSON.parse.
export function verifyWebhook(rawBody, headers, secret = process.env.EVA_WEBHOOK_SECRET) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"] ?? "";
  // Recusa entregas com mais de 5 minutos de diferença (replay).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(
    "v1," + crypto.createHmac("sha256", key).update(\`\${id}.\${timestamp}.\${rawBody}\`).digest("base64")
  );
  // O header pode trazer mais de uma assinatura, separadas por espaço.
  return signatures.split(" ").some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}`;

/** Troca {param} do caminho por um valor de exemplo legível. */
export function exampleUrl(base: string, path: string, examples: Record<string, string> = {}): string {
  return base + path.replace(/\{(\w+)\}/g, (_, name: string) => examples[name] ?? `{${name}}`);
}
