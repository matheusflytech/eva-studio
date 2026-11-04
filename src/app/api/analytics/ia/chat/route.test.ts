import { describe, it, expect, vi, beforeEach } from "vitest";

// Banco, sessão, limitador, motor de consulta e LLM mockados: nenhum teste chama provedor de verdade.
const db = vi.hoisted(() => {
  const lista = () => vi.fn<(a: { where: Record<string, unknown> }) => Promise<unknown[]>>(async () => []);
  return {
    credential: { findMany: lista() },
    organization: { findUnique: vi.fn(async () => ({ chatAiSource: "eva" })) },
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
const motor = vi.hoisted(() => ({ rodarReportQuery: vi.fn() }));
vi.mock("@/lib/server/report-sql", () => motor);

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/analytics/ia/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const mensagens = [{ role: "user", content: "quantos negócios em aberto?" }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "chave-da-eva";
  db.organization.findUnique.mockResolvedValue({ chatAiSource: "eva" });
  perm.requirePermission.mockResolvedValue({ orgId: "org-A", userId: "u", role: "viewer" });
  rl.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 40 });
  // Mesmo com chave cadastrada no contrato, o chat usa só a da Eva.
  db.credential.findMany.mockResolvedValue([{ type: "xai", secretEnc: "segredo" }]);
  db.pipeline.findMany.mockResolvedValue([{ id: "p1", name: "Vendas B2B", stages: [{ id: "s1", name: "Proposta", type: "open" }] }]);
});

describe("POST /api/analytics/ia/chat", () => {
  it("sucesso: usa só a chave da Eva, manda o histórico e devolve o texto", async () => {
    llm.callLlmWithTools.mockResolvedValue({ text: "Há 12 negócios em aberto." });
    const res = await post({ mensagens: [{ role: "user", content: "oi" }, { role: "assistant", content: "olá" }, ...mensagens], pagina: "/deals" });
    expect(res.status).toBe(200);
    expect((await res.json()).resposta).toBe("Há 12 negócios em aberto.");
    const o = llm.callLlmWithTools.mock.calls[0][0];
    expect(o).toMatchObject({ provider: "groq", apiKey: "chave-da-eva", userMessage: "quantos negócios em aberto?" });
    expect(o.history).toHaveLength(2);
    expect(o.tools.map((t: { name: string }) => t.name)).toEqual(["consultar_dados", "mostrar_relatorio"]);
    // Groq derruba o turno inteiro se a IA esquecer um campo obrigatório: o erro volta pela ferramenta, para ela corrigir.
    expect(o.tools.flatMap((t: { params: { required?: boolean }[] }) => t.params).every((p: { required?: boolean }) => p.required === false)).toBe(true);
    expect(o.systemPrompt).toContain("Vendas B2B");
    expect(o.systemPrompt).toContain("/deals");
  });

  it("a ferramenta roda a consulta no contrato da sessão e devolve texto; consulta ruim volta como erro para a IA", async () => {
    llm.callLlmWithTools.mockResolvedValue({ text: "ok" });
    await post({ mensagens });
    const { executeTool } = llm.callLlmWithTools.mock.calls[0][0];

    motor.rodarReportQuery.mockResolvedValue({ columns: [{ key: "m0", label: "Contagem", type: "number", role: "metric" }], rows: [[12]], truncated: false });
    const bom = await executeTool({ id: "1", name: "consultar_dados", arguments: { consulta: JSON.stringify({ dataset: "deals", metrics: [{ op: "count" }] }) } });
    expect(bom).toBe("Contagem\n12");
    expect(motor.rodarReportQuery.mock.calls[0][0]).toBe("org-A");

    expect(await executeTool({ id: "2", name: "consultar_dados", arguments: { consulta: "não é json" } })).toMatch(/JSON válido/);
    expect(await executeTool({ id: "3", name: "consultar_dados", arguments: { consulta: JSON.stringify({ dataset: "tabela_inexistente" }) } })).toMatch(/consulta inválida/i);

    motor.rodarReportQuery.mockRejectedValue(new Error("canceling statement due to statement timeout"));
    expect(await executeTool({ id: "4", name: "consultar_dados", arguments: { consulta: JSON.stringify({ dataset: "deals", metrics: [{ op: "count" }] }) } })).toMatch(/demorou demais/);
  });

  it("mostrar_relatorio devolve o cartão com os dados, no máximo 3, e a IA recebe o texto dos dados", async () => {
    llm.callLlmWithTools.mockResolvedValue({ text: "Resumo." });
    await post({ mensagens });
    const { executeTool } = llm.callLlmWithTools.mock.calls[0][0];
    motor.rodarReportQuery.mockResolvedValue({ columns: [{ key: "m0", label: "Contagem", type: "number", role: "metric" }], rows: [[12]], truncated: false });
    const args = { consulta: JSON.stringify({ dataset: "deals", metrics: [{ op: "count" }] }), visual: "number", titulo: "Negócios" };
    expect(await executeTool({ id: "1", name: "mostrar_relatorio", arguments: args })).toBe("Cartão \"Negócios\" mostrado à pessoa.\nContagem\n12");
    expect(await executeTool({ id: "2", name: "mostrar_relatorio", arguments: { ...args, consulta: "nada" } })).toMatch(/relatório inválido/);
    await executeTool({ id: "3", name: "mostrar_relatorio", arguments: args });
    await executeTool({ id: "4", name: "mostrar_relatorio", arguments: args });
    expect(await executeTool({ id: "5", name: "mostrar_relatorio", arguments: args })).toMatch(/já mostrei 3 cartões/);
  });

  it("a resposta leva os cartões que a IA mostrou; sem texto da IA, o cartão basta", async () => {
    motor.rodarReportQuery.mockResolvedValue({ columns: [{ key: "m0", label: "Contagem", type: "number", role: "metric" }], rows: [[12]], truncated: false });
    llm.callLlmWithTools.mockImplementation(async (o: { executeTool: (c: unknown) => Promise<string> }) => {
      await o.executeTool({ id: "1", name: "mostrar_relatorio", arguments: { consulta: JSON.stringify({ dataset: "deals", metrics: [{ op: "count" }] }), visual: "number", titulo: "Negócios" } });
      return { text: null };
    });
    const res = await post({ mensagens });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.resposta).toMatch(/Aqui está/);
    expect(d.cartoes).toHaveLength(1);
    expect(d.cartoes[0]).toMatchObject({ titulo: "Negócios", viz: "number", result: { rows: [[12]] } });
  });

  it("contrato que escolheu a própria chave: usa a dele; sem chave cadastrada → 503 que explica", async () => {
    db.organization.findUnique.mockResolvedValue({ chatAiSource: "contract" });
    llm.callLlmWithTools.mockResolvedValue({ text: "ok" });
    await post({ mensagens });
    expect(llm.callLlmWithTools.mock.calls[0][0]).toMatchObject({ provider: "xai", apiKey: "dec:segredo" });
    db.credential.findMany.mockResolvedValue([]);
    const res = await post({ mensagens });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/própria chave/);
  });

  it("sem chave de IA → 503 com o código sem_chave", async () => {
    delete process.env.GROQ_API_KEY;
    const res = await post({ mensagens });
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe("sem_chave");
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("erro do provedor → 502 que diz o motivo, sem logar a conversa", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.callLlmWithTools.mockResolvedValue({ text: null, error: "xai 401: invalid_api_key" });
    const res = await post({ mensagens: [{ role: "user", content: "negócios do cliente Fulano CPF 123" }] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/recusou a chave/);
    expect(erro.mock.calls.flat().join(" ")).not.toContain("Fulano");
    erro.mockRestore();
  });

  it("chave da Eva: passou do limite por minuto → 429 sem gastar token; chave do contrato não entra nessa fila", async () => {
    rl.checkRateLimit.mockImplementation(async (chave: string) => (chave === "ia-chat:eva" ? { allowed: false, count: 2, limit: 1 } : { allowed: true, count: 1, limit: 40 }));
    const res = await post({ mensagens });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/outra pergunta/);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
    db.organization.findUnique.mockResolvedValue({ chatAiSource: "contract" });
    llm.callLlmWithTools.mockResolvedValue({ text: "ok" });
    expect((await post({ mensagens })).status).toBe(200);
  });

  it("400 sem pergunta, 429 acima do limite, e a sessão inválida devolve o erro dela", async () => {
    expect((await post({ mensagens: [] })).status).toBe(400);
    rl.checkRateLimit.mockResolvedValue({ allowed: false, count: 41, limit: 40 });
    expect((await post({ mensagens })).status).toBe(429);
    perm.requirePermission.mockResolvedValue({ error: "Não autenticado.", status: 401 });
    expect((await post({ mensagens })).status).toBe(401);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });
});
