import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmToolCall } from "@/lib/server/llm";

// Motor seguindo a saída dos blocos "Responder com IA" (ai-agent) e
// "Enviar para meu fluxo" (agent). Regra (ver flow-engine.ts):
//   - sem ligação: a conversa fica com o bloco (como sempre foi);
//   - com ligação: segue por ela, na MESMA rodada, logo depois da resposta,
//     quando o bloco termina o trabalho: a IA chamou "seguir_fluxo" ou
//     coletou todos os dados pedidos; o fluxo externo respondeu done: true.

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
  message: { findMany: vi.fn(async () => []) },
  knowledgeDoc: { findMany: vi.fn(async () => []) },
}));
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));
const rede = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => ({ marcarComoLead: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ carregarDefinicoes: vi.fn(async () => []) }));
vi.mock("@/lib/server/credentials", () => ({ getCredentialSecret: vi.fn(async () => "chave") }));
vi.mock("@/lib/server/llm", () => llm);
vi.mock("@/lib/server/ssrf", () => rede);
vi.mock("@/lib/server/knowledge-search", () => ({ searchKnowledgeBase: vi.fn(async () => []) }));
const conexao = vi.hoisted(() => ({ passosDaConexao: vi.fn() }));
vi.mock("@/lib/server/ia/conexao", () => conexao);
const uso = vi.hoisted(() => ({ chavesNoLimite: vi.fn(async () => new Set<string>()), registrarUso: vi.fn() }));
vi.mock("@/lib/server/ia/uso", () => uso);
const email = vi.hoisted(() => ({ enviarEmailDoContrato: vi.fn(async () => ({ ok: true, envioId: "env1" })) }));
vi.mock("@/lib/server/email/envio", () => email);

import { advanceConversation } from "./flow-engine";

const base = { agentId: "a1", channel: "instagram", contactId: "IG1" };
const parado = (no: string, vars: Record<string, unknown> = {}) => ({
  id: "c1", status: "active", currentNodeId: no, variables: vars, lastContactMessageAt: null, contactRecordId: null,
});
const gravado = () => db.conversation.update.mock.calls.at(-1)?.[0]?.data;

function fluxo(bloco: Record<string, unknown>, comSaida: boolean) {
  return {
    agentId: "a1",
    nodes: [
      { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
      { id: "bot", position: { x: 0, y: 0 }, data: { label: "Bot", ...bloco } },
      { id: "depois", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Depois", detail: "Anotado, {nome}!" } },
    ],
    edges: [{ id: "e1", source: "start", target: "bot" }, ...(comSaida ? [{ id: "e2", source: "bot", target: "depois" }] : [])],
  };
}

const ia = (extra: Record<string, unknown> = {}) => ({ iconKey: "ai-agent", aiCredentialId: "cred", detail: "Atenda.", ...extra });

/** A IA responde e, se mandado, chama as ferramentas internas antes. */
function iaResponde(texto: string, chamadas: LlmToolCall[] = []) {
  llm.callLlmWithTools.mockImplementation(async (opts: { executeTool: (c: LlmToolCall) => Promise<string>; tools: { name: string }[] }) => {
    for (const c of chamadas) await opts.executeTool(c);
    return { text: texto };
  });
}
const ferramentas = () => (llm.callLlmWithTools.mock.calls.at(-1)?.[0].tools as { name: string }[]).map((t) => t.name);

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "https://n8n.exemplo/webhook" });
});

describe("Responder com IA (ai-agent)", () => {
  it("o prompt leva o cadastro do agente antes do texto do bloco; desligado, só o bloco", async () => {
    db.agent.findUnique.mockResolvedValue({
      id: "a1", orgId: "o1", name: "Eva", description: "", tone: "Leve.", language: "Português",
      instructions: "Venda sofás.", guidelines: "Não dê desconto.", outboundUrl: "",
    });
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Oi!");
    await advanceConversation({ ...base, text: "olá" });
    const prompt = llm.callLlmWithTools.mock.calls.at(-1)?.[0].systemPrompt as string;
    expect(prompt).toContain("## Instruções\nVenda sofás.");
    expect(prompt).toContain("## Nunca faça\nNão dê desconto.");
    expect(prompt.indexOf("Venda sofás.")).toBeLessThan(prompt.indexOf("Atenda."));

    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiUsarAgente: false }), false));
    await advanceConversation({ ...base, text: "olá" });
    expect(llm.callLlmWithTools.mock.calls.at(-1)?.[0].systemPrompt).toBe("Atenda.");
  });

  it("sem ligação: responde e a conversa continua com a IA (e ela nem recebe a ferramenta de seguir)", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Oi!");
    const r = await advanceConversation({ ...base, text: "olá" });
    expect(r.messages.map((m) => m.text)).toEqual(["Oi!"]);
    expect(gravado().currentNodeId).toBe("bot");
    expect(ferramentas()).not.toContain("seguir_fluxo");
  });

  it("com ligação, enquanto a IA não termina: continua com ela", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), true));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Me conta mais.");
    const r = await advanceConversation({ ...base, text: "quero saber preço" });
    expect(r.messages.map((m) => m.text)).toEqual(["Me conta mais."]);
    expect(gravado().currentNodeId).toBe("bot");
    expect(ferramentas()).toContain("seguir_fluxo");
  });

  it("com ligação, a IA chama seguir_fluxo: responde e segue na mesma rodada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), true));
    db.conversation.upsert.mockResolvedValue(parado("bot", { nome: "Ana" }));
    iaResponde("Perfeito.", [{ id: "1", name: "seguir_fluxo", arguments: {} }]);
    const r = await advanceConversation({ ...base, text: "é isso" });
    expect(r.messages.map((m) => m.text)).toEqual(["Perfeito.", "Anotado, Ana!"]);
  });

  it("com ligação e dados a coletar: segue quando o último dado chega", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ collectVars: [{ id: "v", key: "nome", value: "nome da pessoa" }] }), true));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Prazer, Bia!", [{ id: "1", name: "salvar_dados_coletados", arguments: { nome: "Bia" } }]);
    const r = await advanceConversation({ ...base, text: "sou a Bia" });
    expect(r.messages.map((m) => m.text)).toEqual(["Prazer, Bia!", "Anotado, Bia!"]);
  });

  it("chegando pelo fluxo (não estava parado): responde e já segue se terminou", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), true));
    db.conversation.upsert.mockResolvedValue(parado(null as unknown as string, { nome: "Leo" }));
    iaResponde("Oi, Leo.", [{ id: "1", name: "seguir_fluxo", arguments: {} }]);
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Oi, Leo.", "Anotado, Leo!"]);
  });

  it("erro da IA nunca pula a etapa", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia(), true));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    llm.callLlmWithTools.mockImplementation(async (opts: { executeTool: (c: LlmToolCall) => Promise<string> }) => {
      await opts.executeTool({ id: "1", name: "seguir_fluxo", arguments: {} });
      return { text: null, error: "limite" };
    });
    await advanceConversation({ ...base, text: "oi" });
    expect(gravado().currentNodeId).toBe("bot");
  });

  it('erro da IA com a saída "Erro" ligada: segue por ela na mesma rodada', async () => {
    const f = fluxo(ia(), true);
    f.nodes.push({ id: "falha", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Falha", detail: "Já te chamo um atendente." } });
    f.edges.push({ id: "e3", source: "bot", target: "falha", sourceHandle: "erro" } as (typeof f.edges)[number]);
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    llm.callLlmWithTools.mockResolvedValue({ text: null, error: "groq 401" });
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Já te chamo um atendente."]);
  });

  it('a saída "Erro" nunca é usada quando a IA termina bem', async () => {
    const f = fluxo(ia(), true);
    f.nodes.push({ id: "falha", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Falha", detail: "Falhou." } });
    // Ligação de erro primeiro na lista: o motor não pode pegar "a primeira que achar".
    f.edges.splice(1, 0, { id: "e3", source: "bot", target: "falha", sourceHandle: "erro" } as (typeof f.edges)[number]);
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado("bot", { nome: "Ana" }));
    iaResponde("Feito.", [{ id: "1", name: "seguir_fluxo", arguments: {} }]);
    const r = await advanceConversation({ ...base, text: "ok" });
    expect(r.messages.map((m) => m.text)).toEqual(["Feito.", "Anotado, Ana!"]);
  });

  it('com só a saída "Erro" ligada, a IA não recebe a ferramenta de seguir', async () => {
    const f = fluxo(ia(), false);
    f.edges.push({ id: "e3", source: "bot", target: "start", sourceHandle: "erro" } as (typeof f.edges)[number]);
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Oi!");
    await advanceConversation({ ...base, text: "olá" });
    expect(ferramentas()).not.toContain("seguir_fluxo");
  });
});

describe("Responder com IA usando a conexão do contrato", () => {
  const passo = (origem: string) => ({ provider: "openai", apiKey: `k-${origem}`, model: `m-${origem}`, origem });

  it("bloco sem credencial usa a conexão, com o tempo limite dela", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [passo("A")], timeoutMs: 20000 });
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiCredentialId: undefined }), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Oi!");
    const r = await advanceConversation({ ...base, text: "olá" });
    expect(r.messages.map((m) => m.text)).toEqual(["Oi!"]);
    expect(conexao.passosDaConexao).toHaveBeenCalledWith("o1");
    expect(llm.callLlmWithTools.mock.calls.at(-1)?.[0]).toMatchObject({ apiKey: "k-A", model: "m-A", timeoutMs: 20000 });
  });

  it("primeira chave falha: responde pela reserva na mesma rodada", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [passo("A"), passo("B")], timeoutMs: 20000 });
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiFonte: "conexao" }), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    llm.callLlmWithTools.mockImplementation(async (o: { apiKey: string }) =>
      o.apiKey === "k-A" ? { text: null, error: "openai 429: limite" } : { text: "Oi pela reserva." }
    );
    const r = await advanceConversation({ ...base, text: "olá" });
    expect(r.messages.map((m) => m.text)).toEqual(["Oi pela reserva."]);
  });

  it("contrato sem nenhuma chave: erro claro (e segue pela saída Erro se ligada)", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [], timeoutMs: 25000 });
    const f = fluxo(ia({ aiCredentialId: undefined }), false);
    f.nodes.push({ id: "falha", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Falha", detail: "Um atendente já fala com você." } });
    f.edges.push({ id: "e3", source: "bot", target: "falha", sourceHandle: "erro" } as (typeof f.edges)[number]);
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    const r = await advanceConversation({ ...base, text: "olá" });
    expect(r.messages.map((m) => m.text)).toEqual(["Um atendente já fala com você."]);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });
});

describe("uso e limite da IA", () => {
  const passo = (origem: string) => ({ provider: "openai", apiKey: `k-${origem}`, model: `m-${origem}`, origem, credentialId: origem });

  it("registra cada tentativa com os tokens do provedor, inclusive a que falhou", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [passo("A"), passo("B")], timeoutMs: 20000 });
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiFonte: "conexao" }), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    llm.callLlmWithTools.mockImplementation(async (o: { apiKey: string }) =>
      o.apiKey === "k-A" ? { text: null, error: "openai 500", usage: { entrada: 0, saida: 0 } } : { text: "Oi", usage: { entrada: 50, saida: 7 } }
    );
    await advanceConversation({ ...base, text: "olá" });
    expect(uso.registrarUso.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ credentialId: "A", agentId: "a1", orgId: "o1", ok: false }),
      expect.objectContaining({ credentialId: "B", inputTokens: 50, outputTokens: 7, ok: true }),
    ]);
  });

  it("chave no limite do mês sai da fila; a reserva responde", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [passo("A"), passo("B")], timeoutMs: 20000 });
    uso.chavesNoLimite.mockResolvedValueOnce(new Set(["A"]));
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiFonte: "conexao" }), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    iaResponde("Oi da B");
    await advanceConversation({ ...base, text: "olá" });
    expect(llm.callLlmWithTools).toHaveBeenCalledTimes(1);
    expect(llm.callLlmWithTools.mock.calls[0][0].apiKey).toBe("k-B");
  });

  it("todas no limite: erro claro, sem chamar a IA", async () => {
    conexao.passosDaConexao.mockResolvedValue({ passos: [passo("A")], timeoutMs: 20000 });
    uso.chavesNoLimite.mockResolvedValueOnce(new Set(["A"]));
    db.agentFlow.findUnique.mockResolvedValue(fluxo(ia({ aiFonte: "conexao" }), false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    await advanceConversation({ ...base, text: "olá" });
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
  });
});

describe("Enviar e-mail pelo domínio do contrato", () => {
  function fluxoComEmail(bloco: Record<string, unknown>) {
    return {
      agentId: "a1",
      nodes: [
        { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
        { id: "mail", position: { x: 0, y: 0 }, data: { iconKey: "email", label: "E-mail", ...bloco } },
        { id: "fim", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Fim", detail: "Mandei!" } },
      ],
      edges: [
        { id: "e1", source: "start", target: "mail" },
        { id: "e2", source: "mail", target: "fim" },
      ],
    };
  }

  it("bloco novo (sem credencial): texto do bloco com as variáveis do fluxo, para o contato da conversa", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxoComEmail({ emailSubject: "Oi {nome}", emailBody: "Seu pedido, {nome}." }));
    db.conversation.upsert.mockResolvedValue(parado(null as unknown as string, { nome: "Ana" }));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Mandei!"]);
    expect(email.enviarEmailDoContrato).toHaveBeenCalledWith("o1", {
      contactId: "contato-1",
      email: null,
      conteudo: { assunto: "Oi Ana", corpo: "Seu pedido, Ana.", modo: "simples" },
      origem: "fluxo",
      refId: "mail",
    });
  });

  it("com modelo da Biblioteca e Para preenchido", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxoComEmail({ emailModeloId: "m1", emailTo: "{email}" }));
    db.conversation.upsert.mockResolvedValue(parado(null as unknown as string, { email: "ana@x.com" }));
    await advanceConversation({ ...base, text: "oi" });
    expect((email.enviarEmailDoContrato.mock.calls as unknown as [string, unknown][]).at(-1)?.[1]).toMatchObject({ email: "ana@x.com", conteudo: { modeloId: "m1" } });
  });

  it("falha no envio não trava o fluxo (fica no registro do passo)", async () => {
    email.enviarEmailDoContrato.mockResolvedValueOnce({ ok: false, motivo: "sem_dominio", erro: "Verifique o domínio" } as never);
    db.agentFlow.findUnique.mockResolvedValue(fluxoComEmail({ emailSubject: "a", emailBody: "b" }));
    db.conversation.upsert.mockResolvedValue(parado(null as unknown as string));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Mandei!"]);
  });

  it("bloco antigo com credencial própria: não passa pelo envio do contrato", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxoComEmail({ emailCredentialId: "cred", emailTo: "a@b.com", emailSubject: "a", emailBody: "b" }));
    db.conversation.upsert.mockResolvedValue(parado(null as unknown as string));
    await advanceConversation({ ...base, text: "oi" });
    expect(email.enviarEmailDoContrato).not.toHaveBeenCalled();
  });
});

describe("Enviar para meu fluxo (agent)", () => {
  const resposta = (corpo: unknown) => rede.safeFetch.mockResolvedValue({ ok: true, json: async () => corpo });

  it("sem done: a conversa fica com o fluxo externo, mesmo com ligação", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ iconKey: "agent" }, true));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    resposta({ reply: "Vou ver aqui." });
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.map((m) => m.text)).toEqual(["Vou ver aqui."]);
    expect(gravado().currentNodeId).toBe("bot");
  });

  it("done: true com ligação: segue na mesma rodada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ iconKey: "agent" }, true));
    db.conversation.upsert.mockResolvedValue(parado("bot", { nome: "Rui" }));
    resposta({ reply: "Resolvido.", done: true });
    const r = await advanceConversation({ ...base, text: "obrigado" });
    expect(r.messages.map((m) => m.text)).toEqual(["Resolvido.", "Anotado, Rui!"]);
  });

  it("done: true sem ligação: fica onde está (não há para onde ir)", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ iconKey: "agent" }, false));
    db.conversation.upsert.mockResolvedValue(parado("bot"));
    resposta({ reply: "Ok.", done: true });
    await advanceConversation({ ...base, text: "obrigado" });
    expect(gravado().currentNodeId).toBe("bot");
  });
});
