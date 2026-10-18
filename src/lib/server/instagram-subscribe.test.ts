import { describe, it, expect, vi, afterEach } from "vitest";
import { assinarEventosInstagram, INSTAGRAM_FIELDS } from "./instagram-subscribe";

afterEach(() => vi.unstubAllGlobals());

describe("assinarEventosInstagram", () => {
  it("token de Página (Facebook) não tenta assinar aqui", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await assinarEventosInstagram("EAAGtoken");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assina os campos usados pela Eva em /me/subscribed_apps", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await assinarEventosInstagram("IGAAtoken");
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v21.0/me/subscribed_apps");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("subscribed_fields")).toBe(INSTAGRAM_FIELDS.join(","));
    expect(body.get("access_token")).toBe("IGAAtoken");
    expect(INSTAGRAM_FIELDS).toEqual(["messages", "messaging_postbacks", "message_reactions", "comments"]);
  });

  it("erro da Meta volta legível", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("permissão negada", { status: 400 })));
    expect(await assinarEventosInstagram("IGAAtoken")).toEqual({ ok: false, error: "A Meta respondeu 400: permissão negada" });
  });
});
