import { describe, it, expect, vi } from "vitest";
import { getPage, HotmartApiError } from "./api";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
let n = 0;
const creds = () => ({ clientId: `id-${++n}`, clientSecret: "s", basic: "Basic YWJj" });

function fakeFetch(responses: Response[]) {
  const calls: { url: string; method: string; auth: string }[] = [];
  const fn = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", auth: String((init?.headers as Record<string, string>)?.Authorization ?? "") });
    if (String(url).includes("oauth/token")) return json({ access_token: `tok${calls.length}`, expires_in: 3600 });
    return responses.shift() ?? json({ items: [] });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("getPage", () => {
  it("pede o token com Basic, lê a página e repete parâmetro de lista", async () => {
    const f = fakeFetch([json({ items: [{ a: 1 }], page_info: { next_page_token: "p2" } })]);
    const page = await getPage(creds(), "/sales/history", { product_id: 1, transaction_status: ["APPROVED", "REFUNDED"], page_token: undefined }, { fetch: f.fn });
    expect(page).toEqual({ items: [{ a: 1 }], nextPageToken: "p2" });
    expect(f.calls[0]).toMatchObject({ method: "POST", auth: "Basic YWJj" });
    expect(f.calls[1].method).toBe("GET");
    expect(f.calls[1].url).toContain("transaction_status=APPROVED&transaction_status=REFUNDED");
    expect(f.calls[1].url).not.toContain("page_token");
    expect(f.calls[1].auth).toBe("Bearer tok1");
  });

  it("guarda o token entre chamadas", async () => {
    const c = creds();
    const f = fakeFetch([json({ items: [] }), json({ items: [] })]);
    await getPage(c, "/subscriptions", {}, { fetch: f.fn });
    await getPage(c, "/subscriptions", {}, { fetch: f.fn });
    expect(f.calls.filter((x) => x.method === "POST")).toHaveLength(1);
  });

  it("429: espera o RateLimit-Reset e tenta de novo", async () => {
    const sleep = vi.fn(async () => {});
    const f = fakeFetch([json({}, 429, { "RateLimit-Reset": "3" }), json({ items: [{ ok: true }] })]);
    const page = await getPage(creds(), "/sales/users", {}, { fetch: f.fn, sleep });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(page.items).toEqual([{ ok: true }]);
  });

  it("429 seguido: desiste depois de 3 tentativas", async () => {
    const f = fakeFetch([json({}, 429), json({}, 429), json({}, 429), json({}, 429)]);
    await expect(getPage(creds(), "/sales/users", {}, { fetch: f.fn, sleep: async () => {} })).rejects.toBeInstanceOf(HotmartApiError);
  });

  it("401: renova o token uma vez", async () => {
    const f = fakeFetch([json({}, 401), json({ items: [1] })]);
    const page = await getPage(creds(), "/sales/history", {}, { fetch: f.fn });
    expect(page.items).toEqual([1]);
    expect(f.calls.filter((x) => x.method === "POST")).toHaveLength(2);
    expect(f.calls.at(-1)!.auth).toBe("Bearer tok3");
  });

  it("só GET na API (o POST é só o token)", async () => {
    const f = fakeFetch([json({ items: [] })]);
    await getPage(creds(), "/sales/history", {}, { fetch: f.fn });
    expect(f.calls.filter((x) => x.method !== "GET").every((x) => x.url.includes("oauth/token"))).toBe(true);
  });
});
