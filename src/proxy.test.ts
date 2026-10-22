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
  it("link salvo /negocios/123?aba=x vai para o último contrato, preservando tudo", async () => {
    const res = await proxy(pedir("/negocios/123?aba=x", A));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.eva/${A.slice(0, 8)}/negocios/123?aba=x`);
  });

  it("sem cookie, pergunta ao servidor em /ir", async () => {
    const res = await proxy(pedir("/conversas?c=9"));
    expect(res.headers.get("location")).toBe(`https://app.eva/ir?para=${encodeURIComponent("/conversas?c=9")}`);
  });

  it("caminho com contrato, /api e /login passam direto", async () => {
    for (const c of [`/${A}/negocios`, "/api/deals", "/login", "/contratos"]) {
      const res = await proxy(pedir(c, A));
      expect(res.headers.get("location"), c).toBeNull();
    }
  });
});
