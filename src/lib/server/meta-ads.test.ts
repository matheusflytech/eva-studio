import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  marketingConnection: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  marketingAccount: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  adDailyMetric: { upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s.replace(/^enc:/, "") }));

import { connectFromCode, loginUrl, parseSignedRequest, syncAccount } from "./meta-ads";

// Meta falsa: responde por caminho; guarda as URLs pedidas.
const calls: string[] = [];
function fakeMeta(routes: Record<string, unknown | ((u: URL) => unknown)>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    calls.push(input);
    const u = new URL(input);
    const key = Object.keys(routes).find((k) => u.pathname.endsWith(k));
    const body = key ? (typeof routes[key] === "function" ? (routes[key] as (u: URL) => unknown)(u) : routes[key]) : { error: { message: "rota", code: 100 } };
    const isError = !!(body as { error?: unknown }).error;
    return new Response(JSON.stringify(body), { status: isError ? 400 : 200 });
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  process.env.META_ADS_APP_ID = "app1";
  process.env.META_ADS_APP_SECRET = "segredo";
  process.env.META_GRAPH_URL = "https://meta.test/v21.0";
  db.marketingConnection.upsert.mockResolvedValue({ id: "conn1" });
  db.marketingAccount.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe("loginUrl", () => {
  it("com config_id usa o Login for Business; sem ele, pede ads_read", () => {
    expect(loginUrl({ appId: "a", configId: "cfg" }, "https://x/cb", "s")).toContain("config_id=cfg");
    expect(loginUrl({ appId: "a", configId: null }, "https://x/cb", "s")).toContain("scope=ads_read%2Cbusiness_management");
  });
});

describe("connectFromCode", () => {
  it("token de usuário vira o de 60 dias; grava conexão cifrada e contas desligadas", async () => {
    fakeMeta({
      "/oauth/access_token": (u: URL) => (u.searchParams.get("grant_type") ? { access_token: "LONG", expires_in: 5184000 } : { access_token: "SHORT" }),
      "/debug_token": { data: { type: "USER" } },
      "/me": { id: "u1", name: "Fulana" },
      "/me/adaccounts": { data: [{ id: "act_1", name: "Conta 1", currency: "BRL", timezone_name: "America/Sao_Paulo" }], paging: { next: "https://meta.test/v21.0/me/adaccounts2?after=x" } },
      "/me/adaccounts2": { data: [{ id: "act_2", name: "Conta 2", currency: "USD", timezone_name: "UTC" }] },
    });
    const r = await connectFromCode("o1", "user1", "CODE", "https://x/cb");
    expect(r).toEqual({ accounts: 2 });
    const conn = db.marketingConnection.upsert.mock.calls[0][0];
    expect(conn.create).toMatchObject({ orgId: "o1", provider: "meta", externalUserId: "u1", tokenType: "user", secrets: "enc:LONG", externalLabel: "Fulana" });
    expect(conn.create.expiresAt).toBeInstanceOf(Date);
    expect(db.marketingAccount.upsert).toHaveBeenCalledTimes(2);
    expect(db.marketingAccount.upsert.mock.calls[1][0].create).toMatchObject({ externalId: "act_2", currency: "USD", connectionId: "conn1" });
    expect(db.marketingAccount.upsert.mock.calls[0][0].create.enabled).toBeUndefined(); // padrão do banco: desligada
  });

  it("usuário de sistema: sem troca de token e sem validade", async () => {
    fakeMeta({
      "/oauth/access_token": { access_token: "SYS" },
      "/debug_token": { data: { type: "SYSTEM_USER" } },
      "/me": { id: "su1", name: "Eva" },
      "/me/adaccounts": { data: [] },
    });
    await connectFromCode("o1", "user1", "CODE", "https://x/cb");
    expect(calls.filter((c) => c.includes("fb_exchange_token"))).toHaveLength(0);
    expect(db.marketingConnection.upsert.mock.calls[0][0].create).toMatchObject({ tokenType: "system_user", secrets: "enc:SYS", expiresAt: null });
  });
});

describe("syncAccount", () => {
  const ACC = {
    id: "acc1", orgId: "o1", connectionId: "conn1", externalId: "act_1", enabled: true, currency: "BRL", timezone: "America/Sao_Paulo",
    syncedThrough: null, connection: { status: "active", secrets: "enc:TOK", expiresAt: null },
  };
  const NOW = new Date("2026-10-29T15:00:00Z");

  it("lê 30 dias na primeira vez, pagina e grava por (conta, dia, anúncio)", async () => {
    db.marketingAccount.findUnique.mockResolvedValue(ACC);
    fakeMeta({
      "/act_1/insights": { data: [{ date_start: "2026-10-20", ad_id: "a1", campaign_id: "c1", campaign_name: "BF", spend: "10.00" }], paging: { next: "https://meta.test/v21.0/page2/insights2" } },
      "/insights2": { data: [{ date_start: "2026-10-21", ad_id: "a1", campaign_id: "c1", campaign_name: "BF", spend: "5.5" }] },
    });
    expect(await syncAccount("acc1", NOW)).toBe(2);
    const first = new URL(calls[0]);
    expect(JSON.parse(first.searchParams.get("time_range")!)).toEqual({ since: "2026-09-30", until: "2026-10-29" });
    expect(first.searchParams.get("access_token")).toBe("TOK");
    expect(db.adDailyMetric.upsert.mock.calls[1][0].create).toMatchObject({ orgId: "o1", accountId: "acc1", adId: "a1", spendCents: 550, currency: "BRL" });
    expect(db.marketingAccount.update.mock.calls[0][0].data).toMatchObject({ lastSyncError: null, syncLockedUntil: null, syncedThrough: new Date("2026-10-28T00:00:00Z") });
  });

  it("erro 190 marca a conexão para reconectar", async () => {
    db.marketingAccount.findUnique.mockResolvedValue(ACC);
    fakeMeta({ "/act_1/insights": { error: { message: "Error validating access token", code: 190 } } });
    expect(await syncAccount("acc1", NOW)).toBeNull();
    expect(db.marketingConnection.update).toHaveBeenCalledWith({ where: { id: "conn1" }, data: { status: "needs_reauth", lastError: "Error validating access token" } });
    expect(db.marketingAccount.update.mock.calls[0][0].data).toMatchObject({ lastSyncError: "Error validating access token", syncLockedUntil: null });
  });

  it("conta travada por outra rodada não lê", async () => {
    db.marketingAccount.findUnique.mockResolvedValue(ACC);
    db.marketingAccount.updateMany.mockResolvedValue({ count: 0 });
    fakeMeta({});
    expect(await syncAccount("acc1", NOW)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("parseSignedRequest", () => {
  const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sign = (payload: object, secret: string) => {
    const p = b64(JSON.stringify(payload));
    return `${b64(crypto.createHmac("sha256", secret).update(p).digest())}.${p}`;
  };
  it("assinatura certa devolve o usuário; errada, nada", () => {
    expect(parseSignedRequest(sign({ user_id: "u1", algorithm: "HMAC-SHA256" }, "segredo"), "segredo")).toEqual({ user_id: "u1" });
    expect(parseSignedRequest(sign({ user_id: "u1" }, "outro"), "segredo")).toBeNull();
    expect(parseSignedRequest("lixo", "segredo")).toBeNull();
  });
});
