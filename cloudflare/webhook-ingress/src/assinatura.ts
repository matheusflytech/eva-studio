// Assinaturas com Web Crypto (crypto.subtle), que existe no Workers e no Node.

const codificador = new TextEncoder();

function paraHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return paraHex(await crypto.subtle.sign("HMAC", chave, codificador.encode(mensagem)));
}

export async function sha256Hex(texto: string): Promise<string> {
  return paraHex(await crypto.subtle.digest("SHA-256", codificador.encode(texto)));
}

/**
 * Comparação em tempo constante. Percorre sempre o tamanho do maior lado, para
 * não revelar por tempo quantos caracteres do início estavam certos.
 */
export function iguaisEmTempoConstante(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = codificador.encode(a);
  const bb = codificador.encode(b);
  const n = Math.max(ba.length, bb.length);
  let diferenca = ba.length ^ bb.length;
  for (let i = 0; i < n; i++) diferenca |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diferenca === 0;
}

/** X-Hub-Signature-256 da Meta: "sha256=" + HMAC-SHA256(App Secret, corpo cru). */
export async function verificarAssinaturaMeta(
  corpoCru: string,
  cabecalho: string | null,
  appSecret: string | undefined
): Promise<boolean> {
  if (!appSecret || !cabecalho || !cabecalho.startsWith("sha256=")) return false;
  const esperado = "sha256=" + (await hmacSha256Hex(appSecret, corpoCru));
  return iguaisEmTempoConstante(cabecalho, esperado);
}

/**
 * Assinatura do Worker para o app (estilo Standard Webhooks):
 * "v1=" + HMAC-SHA256(segredo, "{timestamp}.{corpo}"). O timestamp entra no
 * HMAC para que uma entrega capturada não possa ser reenviada depois.
 */
export async function assinarParaOApp(segredo: string, timestamp: number, corpo: string): Promise<string> {
  return "v1=" + (await hmacSha256Hex(segredo, `${timestamp}.${corpo}`));
}
