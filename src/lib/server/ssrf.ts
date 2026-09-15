import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Proteção contra SSRF em qualquer fetch server-side com URL escolhida pelo
// usuário (webhook do agente / bloco "Chamar webhook"). Sem isso, um membro
// de qualquer org poderia apontar a URL pra endpoints internos (metadados de
// nuvem em 169.254.169.254, o próprio worker em localhost, serviços na rede
// privada) e ler a resposta de volta numa variável da conversa.
//
// Regras: só http/https, sem credenciais embutidas na URL, host não pode
// resolver pra um IP privado/loopback/link-local/reservado, timeout curto e
// SEM seguir redirect (um 302 pra IP interno burlaria a checagem de DNS).

const DEFAULT_TIMEOUT_MS = 10_000;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true; // loopback
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local / metadados
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast / reservado
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    // IPv4 mapeado (::ffff:a.b.c.d) — valida o IPv4 embutido
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // não reconhecido = bloqueia
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Só http/https é permitido.");
  }
  if (url.username || url.password) {
    throw new Error("Credenciais na URL não são permitidas.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Se já é um IP literal, checa direto; senão resolve o DNS e checa todos.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Destino aponta pra um endereço interno.");
  } else {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) throw new Error("Host não resolve.");
    for (const r of records) {
      if (isPrivateIp(r.address)) throw new Error("Destino aponta pra um endereço interno.");
    }
  }
  return url;
}

// fetch endurecido: valida a URL antes, aplica timeout e recusa redirects.
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  await assertSafeUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(rawUrl, { ...init, redirect: "error", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
