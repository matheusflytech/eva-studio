import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  credential: { findMany: vi.fn() },
  tag: { findMany: vi.fn() },
  segment: { findMany: vi.fn() },
  pipeline: { findMany: vi.fn() },
  messageTemplate: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const rl = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/rate-limit", () => rl);
vi.mock("@/lib/server/llm", () => llm);
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => `dec:${s}` }));

import { POST } from "./route";

const params = Promise.resolve({ agentId: "a1" });
const req = (body: unknown) => new Request("https://eva.test/api", { method: "POST", body: JSON.stringify(body) });

/** Simula o modelo chamando a ferramenta com estes argumentos. */
function modeloResponde(args: Record<string, unknown>) {
  llm.callLlmWithTools.mockImplementation(async (opts: { executeTool: (c: unknown) => Promise<string> }) => {
    await opts.executeTool({ id: "1", name: "entregar_rascunho", arguments: args });
    return { text: null, error: "Excedeu o limite de rodadas" };
  });
}

const rascunho = {
  name: "Proposta B2B",
  channel: "whatsapp_meta",
  trigger: "stage",
  triggerStageId: "st-prop",
  steps: [{ delayMinutes: 2880, text: "Oi {nome}, conseguiu ver a proposta?" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.agent.findFirst.mockResolvedValue({ id: "a1", metaConnection: { agentId: "a1" } });
  db.credential.findMany.mockResolvedValue([{ type: "anthropic", secretEnc: "enc" }]);
  db.tag.findMany.mockResolvedValue([]);
  db.segment.findMany.mockResolvedValue([]);
  db.pipeline.findMany.mockResolvedValue([{ id: "p1", name: "B2B", stages: [{ id: "st-prop", name: "Proposta" }] }]);
  db.messageTemplate.findMany.mockResolvedValue([]);
  rl.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
  modeloResponde({ rascunho: JSON.stringify(rascunho), explicacao: "Lembra da proposta em 2 dias." });
});

describe("POST /sequences/ia/rascunho", () => {
  it("sucesso: devolve o rascunho validado e não grava nada", async () => {
    const res = await POST(req({ pedido: "quando entrar em Proposta, lembrar em 2 dias" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sequencia).toMatchObject({ trigger: "stage", triggerStageId: "st-prop", steps: [{ order: 1, delayMinutes: 2880 }] });
    expect(body.explicacao).toBe("Lembra da proposta em 2 dias.");
    expect(Array.isArray(body.avisos)).toBe(true);
    expect(auth.requirePermission).toHaveBeenCalledWith("broadcasts:send");
    // Chave da org, provedor preferido, sem gravar nada.
    expect(llm.callLlmWithTools).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", apiKey: "dec:enc" }));
    expect(Object.keys(db).every((m) => !("create" in (db as Record<string, object>)[m]))).toBe(true);
  });

  it("o catálogo vai no prompt e só da org da sessão", async () => {
    await POST(req({ pedido: "quando entrar em Proposta, lembrar em 2 dias" }), { params });
    const prompt = llm.callLlmWithTools.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("st-prop");
    expect(db.pipeline.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1" } }));
    expect(db.tag.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1" } }));
    expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", orgId: "o1" } }));
  });

  it("ajuste: o rascunho atual é validado e vai na mensagem", async () => {
    await POST(req({ pedido: "acrescenta outro em 5 dias", atual: rascunho }), { params });
    const msg = llm.callLlmWithTools.mock.calls[0][0].userMessage as string;
    expect(msg).toContain("Rascunho atual");
    expect(msg).toContain("acrescenta outro em 5 dias");
  });

  it("JSON inválido do modelo: 422", async () => {
    modeloResponde({ rascunho: "{isso não é json", explicacao: "" });
    const res = await POST(req({ pedido: "uma régua qualquer" }), { params });
    expect(res.status).toBe(422);
  });

  it("rascunho sem passo utilizável: 422", async () => {
    modeloResponde({ rascunho: JSON.stringify({ ...rascunho, steps: [] }) });
    expect((await POST(req({ pedido: "uma régua qualquer" }), { params })).status).toBe(422);
  });

  it("sem chave da org nem do ambiente: 503 com código sem_chave", async () => {
    db.credential.findMany.mockResolvedValue([]);
    const res = await POST(req({ pedido: "uma régua qualquer" }), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe("sem_chave");
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("sem credencial da org usa a GROQ_API_KEY do ambiente", async () => {
    db.credential.findMany.mockResolvedValue([]);
    process.env.GROQ_API_KEY = "gsk_env";
    expect((await POST(req({ pedido: "uma régua qualquer" }), { params })).status).toBe(200);
    expect(llm.callLlmWithTools).toHaveBeenCalledWith(expect.objectContaining({ provider: "groq", apiKey: "gsk_env" }));
  });

  it("limite por org: 429 sem chamar a IA", async () => {
    rl.checkRateLimit.mockResolvedValue({ allowed: false, count: 31, limit: 30 });
    const res = await POST(req({ pedido: "uma régua qualquer" }), { params });
    expect(res.status).toBe(429);
    expect(rl.checkRateLimit).toHaveBeenCalledWith("ia-rascunho-sequencia:o1", 30, 3600);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("agente de outra org: 404", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect((await POST(req({ pedido: "uma régua qualquer" }), { params })).status).toBe(404);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("sem permissão: 403", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await POST(req({ pedido: "uma régua qualquer" }), { params })).status).toBe(403);
  });

  it("pedido vazio ou longo demais: 400", async () => {
    expect((await POST(req({ pedido: "" }), { params })).status).toBe(400);
    expect((await POST(req({ pedido: "x".repeat(801) }), { params })).status).toBe(400);
    const bad = new Request("https://eva.test/api", { method: "POST", body: "{" });
    expect((await POST(bad, { params })).status).toBe(400);
  });

  it("falha do provedor: 502", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.callLlmWithTools.mockResolvedValue({ text: null, error: "anthropic 500" });
    expect((await POST(req({ pedido: "régua para a cliente Fulana" }), { params })).status).toBe(502);
    expect(log.mock.calls.flat().join(" ")).not.toContain("Fulana");
    log.mockRestore();
  });
});
