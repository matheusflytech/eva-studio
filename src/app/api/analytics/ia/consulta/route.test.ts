import { describe, it, expect, vi, beforeEach } from "vitest";

// Banco, sessão, limitador e LLM mockados: nenhum teste chama provedor de verdade.
const db = vi.hoisted(() => {
  const lista = () => vi.fn<(a: { where: Record<string, unknown> }) => Promise<unknown[]>>(async () => []);
  return {
    credential: { findMany: lista() },
    pipeline: { findMany: lista() },
    profile: { findMany: lista() },
    tag: { findMany: lista() },
    company: { findMany: lista() },
    contactChannel: { findMany: lista() },
    deal: { findMany: lista() },
    customField: { findMany: lista() },
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (v: string) => `dec:${v}` }));
const perm = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/server/permissions", () => perm);
const rl = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => rl);
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));
vi.mock("@/lib/server/llm", () => llm);

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/analytics/ia/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const respostaDoModelo = (obj: unknown) => ({ text: JSON.stringify(obj) });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  perm.requirePermission.mockResolvedValue({ orgId: "org-A", userId: "u", role: "viewer" });
  rl.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
  db.credential.findMany.mockResolvedValue([{ type: "groq", secretEnc: "segredo" }]);
  db.pipeline.findMany.mockResolvedValue([{ id: "p-b2b", name: "Vendas B2B", stages: [{ id: "s1", name: "Proposta", type: "open" }] }]);
  db.profile.findMany.mockResolvedValue([{ id: "u-ana", name: "Ana" }]);
  db.customField.findMany.mockResolvedValue([
    { id: "c1", entity: "deal", pipelineId: null, key: "segmento", label: "Segmento", type: "select", options: [{ value: "varejo", label: "Varejo" }], required: false, helpText: "", showOnCard: false, position: 0 },
  ]);
});

describe("POST /api/analytics/ia/consulta", () => {
  it("sucesso: devolve a consulta conferida, com a chave da org e o catálogo no prompt", async () => {
    llm.callLlmWithTools.mockResolvedValue(
      respostaDoModelo({
        consulta: {
          medida: "contagem",
          agrupar: "",
          status: "abertos",
          funilIds: ["p-b2b", "p-intrusa"],
          filtros: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "cf:segmento", op: "qualquer", valores: ["varejo"] }] }] },
        },
        tipo: "numero",
        titulo: "Varejo em aberto",
        explicacao: "Negócios de varejo em aberto no funil B2B.",
      })
    );
    const res = await post({ pedido: "negócios de varejo em aberto no B2B" });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d).toMatchObject({ modo: "cartao", tipo: "numero", titulo: "Varejo em aberto", explicacao: "Negócios de varejo em aberto no funil B2B." });
    expect(d.consulta.funilIds).toEqual(["p-b2b"]);
    expect(d.avisos.join(" ")).toMatch(/funil que não existe/);

    const chamada = llm.callLlmWithTools.mock.calls[0][0];
    expect(chamada).toMatchObject({ provider: "groq", apiKey: "dec:segredo", userMessage: "negócios de varejo em aberto no B2B" });
    expect(chamada.systemPrompt).toContain("funil p-b2b = Vendas B2B");
    expect(chamada.systemPrompt).toContain("America/Sao_Paulo");
    expect(chamada.systemPrompt).not.toContain("segredo");
  });

  it("org isolada: catálogo, credencial e limite saem só da org da sessão, mesmo que o corpo diga outra", async () => {
    llm.callLlmWithTools.mockResolvedValue(respostaDoModelo({ consulta: { medida: "contagem", agrupar: "" } }));
    await post({ pedido: "quantos negócios", orgId: "org-B" });
    for (const m of [db.credential, db.pipeline, db.tag, db.company, db.deal, db.customField]) {
      expect(m.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org-A" });
    }
    // Membros = vínculo com o contrato (ou contrato padrão), sempre o da sessão.
    const ondeMembros = JSON.stringify(db.profile.findMany.mock.calls[0][0].where);
    expect(ondeMembros).toContain('"orgId":"org-A"');
    expect(ondeMembros).not.toContain("org-B");
    expect(db.contactChannel.findMany.mock.calls[0][0].where).toMatchObject({ contact: { orgId: "org-A" } });
    expect(rl.checkRateLimit).toHaveBeenCalledWith("ia-consulta:org-A", expect.any(Number), expect.any(Number));
  });

  it("modo globais: devolve período/funis/responsáveis e sugere cartão para o resto", async () => {
    llm.callLlmWithTools.mockResolvedValue(
      respostaDoModelo({
        consulta: {
          medida: "contagem",
          agrupar: "",
          status: "todos",
          funilIds: ["p-b2b"],
          periodo: { ultimosDias: 7 },
          filtros: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "responsavel", op: "qualquer", valores: ["u-ana"] }, { campo: "valor", op: "gte", valor: "5000" }] }] },
        },
      })
    );
    const res = await post({ pedido: "últimos 7 dias da Ana no B2B acima de 5 mil", modo: "globais", globaisAtuais: { dias: 30 } });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.globais).toEqual({ dias: 7, funis: ["p-b2b"], donos: ["u-ana"] });
    expect(d.sobras).toHaveLength(1);
    expect(d.cartao.consulta.filtros.grupos.length).toBeGreaterThan(0);
  });

  it("JSON inválido do modelo → 422 com mensagem", async () => {
    llm.callLlmWithTools.mockResolvedValue({ text: "Claro! Vou montar isso pra você." });
    const res = await post({ pedido: "quanto ganhei" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Não consegui/);
  });

  it("sem chave na org nem na plataforma → 503, sem chamar o LLM", async () => {
    db.credential.findMany.mockResolvedValue([]);
    const res = await post({ pedido: "quanto ganhei" });
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe("sem_chave");
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("sem credencial da org, usa a GROQ_API_KEY da plataforma", async () => {
    db.credential.findMany.mockResolvedValue([]);
    process.env.GROQ_API_KEY = "chave-plataforma";
    llm.callLlmWithTools.mockResolvedValue(respostaDoModelo({ consulta: { medida: "contagem", agrupar: "" } }));
    expect((await post({ pedido: "quantos" })).status).toBe(200);
    expect(llm.callLlmWithTools.mock.calls[0][0]).toMatchObject({ provider: "groq", apiKey: "chave-plataforma" });
  });

  it("prefere Anthropic a Groq quando a org tem as duas", async () => {
    db.credential.findMany.mockResolvedValue([{ type: "groq", secretEnc: "g" }, { type: "anthropic", secretEnc: "a" }]);
    llm.callLlmWithTools.mockResolvedValue(respostaDoModelo({ consulta: { medida: "contagem", agrupar: "" } }));
    await post({ pedido: "quantos" });
    expect(llm.callLlmWithTools.mock.calls[0][0]).toMatchObject({ provider: "anthropic", apiKey: "dec:a" });
  });

  it("limite de taxa → 429, sem chamar o LLM", async () => {
    rl.checkRateLimit.mockResolvedValue({ allowed: false, count: 31, limit: 30 });
    const res = await post({ pedido: "quanto ganhei" });
    expect(res.status).toBe(429);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("erro do provedor → 502 com mensagem humana, sem logar o pedido", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.callLlmWithTools.mockResolvedValue({ text: null, error: "groq 500: boom" });
    const res = await post({ pedido: "negócios do cliente Fulano CPF 123" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/instável agora/);
    expect(erro.mock.calls.flat().join(" ")).not.toContain("Fulano");
    erro.mockRestore();
  });

  it("400 para pedido vazio ou longo demais; sessão inválida devolve o erro dela", async () => {
    expect((await post({ pedido: "   " })).status).toBe(400);
    expect((await post({ pedido: "x".repeat(501) })).status).toBe(400);
    perm.requirePermission.mockResolvedValue({ error: "Não autenticado.", status: 401 });
    expect((await post({ pedido: "oi" })).status).toBe(401);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });
});
