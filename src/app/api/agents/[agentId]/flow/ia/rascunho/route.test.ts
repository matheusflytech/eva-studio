import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  credential: { findMany: vi.fn() },
  tag: { findMany: vi.fn() },
  pipeline: { findMany: vi.fn() },
  customField: { findMany: vi.fn() },
  messageTemplate: { findMany: vi.fn() },
  agentFlow: { upsert: vi.fn() },
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

function modeloResponde(args: Record<string, unknown>) {
  llm.callLlmWithTools.mockImplementation(async (opts: { executeTool: (c: unknown) => Promise<string> }) => {
    await opts.executeTool({ id: "1", name: "entregar_rascunho", arguments: args });
    return { text: null, error: "Excedeu o limite de rodadas" };
  });
}

const fluxo = {
  nodes: [
    { id: "s", bloco: "start" },
    { id: "n", bloco: "capture", label: "Nome", detail: "Como posso te chamar?", captureField: "name" },
    { id: "d", bloco: "crm-deal", label: "Negócio", crmPipelineId: "p1", crmStageId: "st-novo" },
    { id: "f", bloco: "end" },
  ],
  edges: [
    { source: "s", target: "n" },
    { source: "n", target: "d" },
    { source: "d", target: "f" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.agent.findFirst.mockResolvedValue({ id: "a1", widgetEnabled: true });
  db.credential.findMany.mockResolvedValue([{ type: "openai", secretEnc: "enc" }]);
  db.tag.findMany.mockResolvedValue([]);
  db.pipeline.findMany.mockResolvedValue([{ id: "p1", name: "B2B", stages: [{ id: "st-novo", name: "Novo lead" }] }]);
  db.customField.findMany.mockResolvedValue([]);
  db.messageTemplate.findMany.mockResolvedValue([]);
  rl.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
  // Objeto em vez de string: alguns provedores mandam assim.
  modeloResponde({ rascunho: fluxo, explicacao: "Pergunta o nome e cria o negócio." });
});

describe("POST /flow/ia/rascunho", () => {
  it("sucesso: grafo normalizado, nada gravado", async () => {
    const res = await POST(req({ pedido: "pergunta o nome e cria negócio no B2B" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fluxo.nodes).toHaveLength(4);
    expect(body.fluxo.edges).toHaveLength(3);
    expect(body.fluxo.nodes.find((n: { data: { iconKey: string } }) => n.data.iconKey === "crm-deal").data.crmStageId).toBe("st-novo");
    expect(body.explicacao).toMatch(/nome/);
    expect(auth.requirePermission).toHaveBeenCalledWith("agents:manage");
    expect(db.agentFlow.upsert).not.toHaveBeenCalled();
    expect(llm.callLlmWithTools).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", apiKey: "dec:enc" }));
  });

  it("org isolada: catálogo e agente sempre pela org da sessão", async () => {
    await POST(req({ pedido: "pergunta o nome e cria negócio" }), { params });
    expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", orgId: "o1" } }));
    expect(db.pipeline.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1" } }));
    expect(db.customField.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1" } }));
  });

  it("etapa que não está no catálogo da org é limpa com aviso", async () => {
    const n = fluxo.nodes.map((x) => (x.id === "d" ? { ...x, crmStageId: "st-outra-org", crmPipelineId: "p-outra" } : x));
    modeloResponde({ rascunho: JSON.stringify({ ...fluxo, nodes: n }) });
    const body = await (await POST(req({ pedido: "pergunta o nome e cria negócio" }), { params })).json();
    const deal = body.fluxo.nodes.find((x: { data: { iconKey: string } }) => x.data.iconKey === "crm-deal");
    expect(deal.data.crmStageId).toBeUndefined();
    expect(deal.data.crmPipelineId).toBeUndefined();
    expect(body.avisos.length).toBeGreaterThan(0);
  });

  it("ajuste manda o rascunho atual compacto", async () => {
    const atual = { nodes: [{ id: "x", position: { x: 1, y: 2 }, data: { iconKey: "message", label: "Oi", detail: "Olá" } }], edges: [] };
    await POST(req({ pedido: "acrescenta uma pergunta de e-mail", atual }), { params });
    const msg = llm.callLlmWithTools.mock.calls[0][0].userMessage as string;
    expect(msg).toContain('"bloco":"message"');
    expect(msg).not.toContain("position");
  });

  it("JSON inválido: 422", async () => {
    modeloResponde({ rascunho: "nada de json aqui" });
    expect((await POST(req({ pedido: "um fluxo qualquer" }), { params })).status).toBe(422);
  });

  it("modelo respondeu texto sem JSON: 422", async () => {
    llm.callLlmWithTools.mockResolvedValue({ text: "Claro! Aqui vai uma ideia de fluxo..." });
    expect((await POST(req({ pedido: "um fluxo qualquer" }), { params })).status).toBe(422);
  });

  it("grafo sem nada utilizável: 422", async () => {
    modeloResponde({ rascunho: JSON.stringify({ nodes: [{ id: "x", bloco: "foguete" }], edges: [] }) });
    expect((await POST(req({ pedido: "um fluxo qualquer" }), { params })).status).toBe(422);
  });

  it("sem chave: 503", async () => {
    db.credential.findMany.mockResolvedValue([]);
    const res = await POST(req({ pedido: "um fluxo qualquer" }), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe("sem_chave");
  });

  it("limite por org: 429", async () => {
    rl.checkRateLimit.mockResolvedValue({ allowed: false, count: 31, limit: 30 });
    const res = await POST(req({ pedido: "um fluxo qualquer" }), { params });
    expect(res.status).toBe(429);
    expect(rl.checkRateLimit).toHaveBeenCalledWith("ia-rascunho-fluxo:o1", 30, 3600);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("agente de outra org: 404; sem permissão: 403", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect((await POST(req({ pedido: "um fluxo qualquer" }), { params })).status).toBe(404);
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await POST(req({ pedido: "um fluxo qualquer" }), { params })).status).toBe(403);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("permissão pedida é a de editar agente/fluxo", async () => {
    await POST(req({ pedido: "um fluxo qualquer" }), { params });
    expect(auth.requirePermission).toHaveBeenCalledWith("agents:manage");
  });

  it("pedido vazio ou longo demais: 400 sem chamar a IA", async () => {
    expect((await POST(req({ pedido: "" }), { params })).status).toBe(400);
    expect((await POST(req({ pedido: "x".repeat(801) }), { params })).status).toBe(400);
    expect((await POST(new Request("https://eva.test/api", { method: "POST", body: "{" }), { params })).status).toBe(400);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });

  it("falha do provedor: 502 e o pedido não vai para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.callLlmWithTools.mockResolvedValue({ text: null, error: "openai 500: erro interno" });
    const res = await POST(req({ pedido: "fluxo do cliente Fulano da Silva" }), { params });
    expect(res.status).toBe(502);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).not.toContain("Fulano");
    log.mockRestore();
  });
});
