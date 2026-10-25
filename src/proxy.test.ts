import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { proxy } from "./proxy";

const A = "11111111-1111-4111-8111-111111111111";

function pedir(caminho: string, cookie?: string) {
  return new NextRequest(new URL(caminho, "https://app.eva"), {
    headers: cookie ? { cookie: `eva_contrato=${cookie}` } : {},
  });
}

describe("proxy: caminhos antigos", () => {
  it("link salvo /negocios/123?aba=x vai para o último contrato, já em inglês (307: depende do cookie)", async () => {
    const res = await proxy(pedir("/negocios/123?funil=2&aba=x", A));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.eva/${A.slice(0, 8)}/deals/123?pipeline=2&tab=x`);
  });

  it("sem cookie, pergunta ao servidor em /go", async () => {
    const res = await proxy(pedir("/conversas?c=9"));
    expect(res.headers.get("location")).toBe(`https://app.eva/go?to=${encodeURIComponent("/conversations?c=9")}`);
  });

  it("com contrato, nome em português vira inglês com 308", async () => {
    const res = await proxy(pedir(`/${A}/negocios/123?funil=2&aba=funis`, A));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`https://app.eva/${A}/deals/123?pipeline=2&tab=pipelines`);
  });

  it("e-mails já enviados: /convite, /descadastro e /ir continuam funcionando", async () => {
    const casos: [string, string][] = [
      ["/convite?t=abc", "/invite?t=abc"],
      ["/descadastro?t=abc", "/unsubscribe?t=abc"],
      ["/ir?para=%2Fnegocios", "/go?to=%2Fnegocios"],
      ["/contratos", "/contracts"],
    ];
    for (const [de, para] of casos) {
      const res = await proxy(pedir(de));
      expect(res.status, de).toBe(308);
      expect(res.headers.get("location"), de).toBe(`https://app.eva${para}`);
    }
  });

  it("caminho atual, /api e /login passam direto", async () => {
    for (const c of [`/${A}/deals?pipeline=2`, "/api/deals?busca=x", "/login", "/contracts", "/invite?t=1"]) {
      const res = await proxy(pedir(c, A));
      expect(res.headers.get("location"), c).toBeNull();
    }
  });
});
