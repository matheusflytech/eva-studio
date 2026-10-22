import { describe, it, expect, vi, afterEach } from "vitest";
import {
  desafioS256,
  gerarVerificador,
  lerCookie,
  montarCookie,
  stateConfere,
  trocarCodigoPorChave,
  urlDeAutorizacao,
} from "./openrouter-oauth";

afterEach(() => vi.unstubAllGlobals());

describe("PKCE", () => {
  it("desafio S256 do exemplo da RFC 7636", () => {
    expect(desafioS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("verificador é base64url com entropia (43 caracteres, sem repetir)", () => {
    const a = gerarVerificador();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerarVerificador()).not.toBe(a);
  });

  it("URL de autorização leva callback, desafio, método e state", () => {
    const u = new URL(urlDeAutorizacao({ callbackUrl: "https://app.eva/api/ia/openrouter/callback", verificador: "v", state: "s1", rotulo: "Eva Studio" }));
    expect(u.origin + u.pathname).toBe("https://openrouter.ai/auth");
    expect(u.searchParams.get("callback_url")).toBe("https://app.eva/api/ia/openrouter/callback");
    expect(u.searchParams.get("code_challenge")).toBe(desafioS256("v"));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("key_label")).toBe("Eva Studio");
    // O verificador nunca sai do servidor.
    expect(u.toString()).not.toContain("code_verifier");
  });
});

describe("cookie e state", () => {
  it("ida e volta do cookie", () => {
    expect(lerCookie(montarCookie("org", "st", "ver"))).toEqual({ orgId: "org", state: "st", verificador: "ver" });
    expect(lerCookie(undefined)).toBeNull();
    expect(lerCookie("a|b")).toBeNull();
    expect(lerCookie("a||c")).toBeNull();
  });

  it("state confere só se for idêntico", () => {
    expect(stateConfere("abc", "abc")).toBe(true);
    expect(stateConfere("abc", "abd")).toBe(false);
    expect(stateConfere("abc", "ab")).toBe(false);
    expect(stateConfere("abc", null)).toBe(false);
  });
});

describe("trocarCodigoPorChave", () => {
  it("manda código e verificador e devolve a chave", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ key: "sk-or-v1-x" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await trocarCodigoPorChave("c1", "ver")).toEqual({ key: "sk-or-v1-x" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(JSON.parse(String(init.body))).toEqual({ code: "c1", code_verifier: "ver", code_challenge_method: "S256" });
  });

  it("erros viram código curto, sem corpo do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    expect(await trocarCodigoPorChave("c", "v")).toEqual({ erro: "troca_400" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await trocarCodigoPorChave("c", "v")).toEqual({ erro: "sem_chave" });
  });
});
