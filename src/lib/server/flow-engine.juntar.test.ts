import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mensagens quebradas no WhatsApp: o motor grava cada uma, espera a janela e
// só a última responde, mandando à IA tudo o que veio desde a última resposta.

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
  message: { findMany: vi.fn(), findFirst: vi.fn() },
  knowledgeDoc: { findMany: vi.fn(async () => []) },
}));
const inbox = vi.hoisted(() => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => inbox);
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => ({ marcarComoLead: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ carregarDefinicoes: vi.fn(async () => []) }));
vi.mock("@/lib/server/credentials", () => ({ getCredentialSecret: vi.fn(async () => "chave") }));
vi.mock("@/lib/server/llm", () => llm);
vi.mock("@/lib/server/ssrf", () => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/server/knowledge-search", () => ({ searchKnowledgeBase: vi.fn(async () => []) }));
vi.mock("@/lib/server/ia/conexao", () => ({ passosDaConexao: vi.fn() }));
vi.mock("@/lib/server/ia/uso", () => ({ chavesNoLimite: vi.fn(async () => new Set<string>()), registrarUso: vi.fn() }));
const anexos = vi.hoisted(() => ({
  transcreverAudioDoWhatsApp: vi.fn(async () => "manda o preço"),
  entenderAnexosDoWhatsApp: vi.fn(async (_o: string, lista: { path: string }[]) => (lista.length ? `[leu ${lista.map((a) => a.path).join(",")}]` : undefined)),
}));
vi.mock("@/lib/server/anexos-whatsapp", () => anexos);

import { advanceConversation, JANELA_DE_JUNTAR_MS } from "./flow-engine";

const T = (s: number) => new Date(Date.UTC(2026, 9, 24, 12, 0, s));
const fluxo = {
  agentId: "a1",
  nodes: [
    { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
    { id: "bot", position: { x: 0, y: 0 }, data: { iconKey: "ai-agent", label: "IA", aiCredentialId: "cred", detail: "Atenda." } },
  ],
  edges: [{ id: "e1", source: "start", target: "bot" }],
};

/** Roda o motor deixando a espera passar. */
async function rodar(input: Parameters<typeof advanceConversation>[0]) {
  const p = advanceConversation(input);
  await vi.advanceTimersByTimeAsync(JANELA_DE_JUNTAR_MS);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "" });
  db.agentFlow.findUnique.mockResolvedValue(fluxo);
  db.conversation.upsert.mockResolvedValue({
    id: "c1", status: "active", currentNodeId: "bot", variables: {}, lastContactMessageAt: null, contactRecordId: null,
  });
  inbox.registrarMensagens.mockResolvedValue([{ id: "m3", createdAt: T(3) }]);
  llm.callLlmWithTools.mockResolvedValue({ text: "Oi! Em que posso ajudar?" });
});
afterEach(() => vi.useRealTimers());

const base = { agentId: "a1", channel: "whatsapp_qr", contactId: "5547999990000@s.whatsapp.net" };

describe("juntar mensagens seguidas (WhatsApp)", () => {
  it("chegou outra depois: esta sai sem resposta e sem chamar a IA", async () => {
    db.message.findFirst.mockResolvedValueOnce({ id: "m4" }); // mensagem posterior
    const r = await rodar({ ...base, text: "E" });
    expect(r.messages).toEqual([]);
    expect(llm.callLlmWithTools).not.toHaveBeenCalled();
    expect(inbox.registrarMensagens).toHaveBeenCalledTimes(1); // a mensagem ficou gravada
  });

  it("é a última: a IA recebe tudo desde a última resposta, numa vez só, e o histórico para antes", async () => {
    db.message.findFirst
      .mockResolvedValueOnce(null) // nada depois
      .mockResolvedValueOnce({ createdAt: T(0) }); // última resposta do bot
    db.message.findMany.mockImplementation(async (args: { where: { role: unknown; createdAt?: { lt?: Date } } }) =>
      args.where.role === "contact"
        ? [{ text: "Ss", createdAt: T(3) }, { text: "S", createdAt: T(2) }, { text: "E", createdAt: T(1) }]
        : [{ role: "bot", text: "Olá!", createdAt: T(0) }]
    );
    const r = await rodar({ ...base, text: "Ss" });

    const chamada = llm.callLlmWithTools.mock.calls.at(-1)?.[0];
    expect(chamada.userMessage).toBe("E\nS\nSs");
    const historico = db.message.findMany.mock.calls.find((c) => (c[0].where.role as { in?: string[] }).in)?.[0];
    expect(historico.where.createdAt).toEqual({ lt: T(1) });
    expect(r.messages.map((m) => m.text)).toEqual(["Oi! Em que posso ajudar?"]);
    // As do contato já estavam gravadas: no fim só entra a resposta.
    const fim = inbox.registrarMensagens.mock.calls.at(-1)?.[1] as { role: string }[];
    expect(fim.map((m) => m.role)).toEqual(["bot"]);
  });

  it("áudio vira texto antes de gravar; foto das mensagens juntadas vai para a IA", async () => {
    db.message.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.message.findMany.mockImplementation(async (args: { where: { role: unknown } }) =>
      args.where.role === "contact"
        ? [
            { text: "manda o preço", createdAt: T(3), mediaPath: "o1/a.ogg", mediaType: "audio", mediaMime: "audio/ogg", mediaName: null },
            { text: "[Foto]", createdAt: T(1), mediaPath: "o1/f.jpg", mediaType: "image", mediaMime: "image/jpeg", mediaName: null },
          ]
        : []
    );
    await rodar({ ...base, text: "[Áudio]", media: { path: "o1/a.ogg", type: "audio", mime: "audio/ogg" } });

    expect((inbox.registrarMensagens.mock.calls[0][1] as { text: string }[])[0].text).toBe("manda o preço");
    expect(llm.callLlmWithTools.mock.calls.at(-1)?.[0].userMessage).toBe("[Foto]\nmanda o preço\n\n[leu o1/f.jpg,o1/a.ogg]");
  });

  it("fora do WhatsApp: nada é transcrito nem lido aqui", async () => {
    db.message.findMany.mockResolvedValue([]);
    await advanceConversation({ ...base, channel: "instagram", text: "[Áudio]", media: { path: "x", type: "audio", mime: "audio/ogg" } });
    expect(anexos.transcreverAudioDoWhatsApp).not.toHaveBeenCalled();
    expect(anexos.entenderAnexosDoWhatsApp).not.toHaveBeenCalled();
  });

  it("grupo, Instagram e conversa fora da IA respondem na hora, sem esperar", async () => {
    db.message.findMany.mockResolvedValue([]);
    await advanceConversation({ ...base, contactId: "1203630@g.us", text: "@eva oi" });
    await advanceConversation({ ...base, channel: "instagram", text: "oi" });
    expect(llm.callLlmWithTools).toHaveBeenCalledTimes(2);
    expect(db.message.findFirst).not.toHaveBeenCalled();
  });
});
