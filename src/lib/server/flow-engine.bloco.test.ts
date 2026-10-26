import { describe, it, expect, vi, beforeEach } from "vitest";

// Motor rodando o Bloco do Studio: ações de entrada → conteúdo → (espera a
// resposta, com a mesma validação da Captura) → ações de saída → saída
// (primeira condição verdadeira e ligada; senão botão, inválida ou padrão).

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
  message: { findMany: vi.fn(async () => []) },
  knowledgeDoc: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => ({ marcarComoLead: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ carregarDefinicoes: vi.fn(async () => []) }));
vi.mock("@/lib/server/storage", () => ({
  caminhoDaOrg: (caminho: string, orgId: string) => caminho.startsWith(`${orgId}/`),
  urlAssinada: vi.fn(async (caminho: string) => `https://storage.test/sign/${caminho}?token=t`),
}));

import { advanceConversation } from "./flow-engine";

const base = { agentId: "a1", channel: "instagram", contactId: "IG1" };
const parado = (no: string | null, vars: Record<string, unknown> = {}) => ({
  id: "c1", status: "active", currentNodeId: no, variables: vars, lastContactMessageAt: null, contactRecordId: null,
});
const gravado = () => db.conversation.update.mock.calls.at(-1)?.[0]?.data;
const textos = (r: { messages: { text: string }[] }) => r.messages.map((m) => m.text);

type Ligacao = { id: string; source: string; target: string; sourceHandle?: string };
const msg = (id: string, detail: string) => ({ id, position: { x: 0, y: 0 }, data: { iconKey: "message", label: id, detail } });
const variavel = (id: string, variableName: string, variableExpression: string) => ({
  id,
  data: { iconKey: "variable", label: id, variableName, variableExpression },
});

/** Início → Bloco; o Bloco liga em "padrao" (sem nome) e nas saídas nomeadas pedidas. */
function fluxo(bloco: Record<string, unknown>, saidas: Record<string, string> = {}) {
  const destinos = { padrao: "Seguiu pelo padrão.", ...saidas };
  return {
    agentId: "a1",
    nodes: [
      { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
      { id: "bloco", position: { x: 0, y: 0 }, data: { iconKey: "studio-block", label: "Bloco", ...bloco } },
      ...Object.entries(destinos).map(([saida, texto]) => msg(`m-${saida}`, texto)),
    ],
    edges: [
      { id: "e0", source: "start", target: "bloco" },
      ...Object.keys(destinos).map(
        (saida): Ligacao => ({ id: `e-${saida}`, source: "bloco", target: `m-${saida}`, ...(saida === "padrao" ? {} : { sourceHandle: saida }) })
      ),
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "" });
});

describe("Bloco do Studio", () => {
  it("sem pergunta: ações de entrada, conteúdo com digitando, ações de saída e segue pelo padrão na mesma rodada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({
        entryActions: [variavel("a1", "plano", "pro")],
        blockContents: [
          { id: "c1", type: "text", text: "Plano {plano}." },
          { id: "c2", type: "typing", seconds: 3 },
          { id: "c3", type: "text", text: "Tudo certo." },
          { id: "c4", type: "text", text: "  " },
        ],
        exitActions: [variavel("a2", "etapa", "fim")],
      })
    );
    db.conversation.upsert.mockResolvedValue(parado(null));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(textos(r)).toEqual(["Plano pro.", "Tudo certo.", "Seguiu pelo padrão."]);
    expect(r.messages[1]).toMatchObject({ digitando: 3000 });
    expect(gravado().variables).toMatchObject({ plano: "pro", etapa: "fim" });
  });

  it("com botões: o último texto leva os botões e a conversa espera; o botão escolhido decide a saída", async () => {
    const f = fluxo(
      {
        blockContents: [{ id: "c1", type: "text", text: "Quer falar com quem?" }],
        waitForReply: true,
        variableName: "setor",
        options: [{ id: "vendas", label: "Vendas" }, { id: "suporte", label: "Suporte" }],
        exitActions: [variavel("a1", "visto", "sim")],
      },
      { vendas: "Chamando vendas.", suporte: "Chamando suporte." }
    );
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado(null));
    const r1 = await advanceConversation({ ...base, text: "oi" });
    expect(r1.messages).toEqual([{ text: "Quer falar com quem?", options: [{ id: "vendas", label: "Vendas" }, { id: "suporte", label: "Suporte" }] }]);
    expect(gravado().currentNodeId).toBe("bloco");

    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    const r2 = await advanceConversation({ ...base, text: "suporte" });
    expect(textos(r2)).toEqual(["Chamando suporte."]);
    expect(gravado().variables).toMatchObject({ setor: "Suporte", visto: "sim" });
  });

  it("condição verdadeira (e ligada) ganha do botão; condição sem ligação é ignorada", async () => {
    const f = fluxo(
      {
        blockContents: [{ id: "c1", type: "text", text: "Escolha." }],
        waitForReply: true,
        variableName: "setor",
        options: [{ id: "vendas", label: "Vendas" }],
        exitConditions: [
          { id: "solta", label: "Sem ligação", expression: '{setor} == "Vendas"' },
          { id: "vip", label: "VIP", expression: '{vip} == "sim"' },
        ],
      },
      { vendas: "Vendas comum.", vip: "Atendimento VIP." }
    );
    db.agentFlow.findUnique.mockResolvedValue(f);
    db.conversation.upsert.mockResolvedValue(parado("bloco", { vip: "sim" }));
    expect(textos(await advanceConversation({ ...base, text: "1" }))).toEqual(["Atendimento VIP."]);

    db.conversation.upsert.mockResolvedValue(parado("bloco", { vip: "nao" }));
    expect(textos(await advanceConversation({ ...base, text: "1" }))).toEqual(["Vendas comum."]);
  });

  it("botão não reconhecido: repete o último texto do conteúdo com os botões", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({
        blockContents: [{ id: "c1", type: "text", text: "Olá!" }, { id: "c2", type: "text", text: "Sim ou não?" }],
        waitForReply: true,
        options: [{ id: "s", label: "Sim" }, { id: "n", label: "Não" }],
      })
    );
    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    const r = await advanceConversation({ ...base, text: "talvez" });
    expect(r.messages).toEqual([{ text: "Sim ou não?", options: [{ id: "s", label: "Sim" }, { id: "n", label: "Não" }] }]);
    expect(gravado().currentNodeId).toBe("bloco");
  });

  it("pergunta com validação de e-mail: inválido pede de novo; válido guarda e segue", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({ blockContents: [{ id: "c1", type: "text", text: "Seu e-mail?" }], waitForReply: true, captureField: "email" })
    );
    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    const r1 = await advanceConversation({ ...base, text: "não sei" });
    expect(textos(r1)[0]).toMatch(/e-mail não parece certo/);
    expect(gravado().currentNodeId).toBe("bloco");

    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    const r2 = await advanceConversation({ ...base, text: "ana@exemplo.com" });
    expect(textos(r2)).toEqual(["Seguiu pelo padrão."]);
    expect(gravado().variables).toMatchObject({ email: "ana@exemplo.com" });
  });

  it("desistiu depois das tentativas: sai por \"Não respondeu certo\"", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo(
        { blockContents: [{ id: "c1", type: "text", text: "Seu e-mail?" }], waitForReply: true, captureField: "email", captureMaxRetries: 0 },
        { invalido: "Tudo bem, seguimos sem." }
      )
    );
    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    expect(textos(await advanceConversation({ ...base, text: "xx" }))).toEqual(["Tudo bem, seguimos sem."]);
  });
});

describe("Bloco do Studio: não respondeu no prazo", () => {
  const comPrazo = (saidas: Record<string, string> = {}) =>
    fluxo({ blockContents: [{ id: "c1", type: "text", text: "Seu e-mail?" }], waitForReply: true, captureField: "email", replyTimeoutMinutes: 30 }, saidas);

  it("arma o prazo ao parar no Bloco e limpa quando o cliente responde", async () => {
    db.agentFlow.findUnique.mockResolvedValue(comPrazo());
    db.conversation.upsert.mockResolvedValue(parado(null));
    const antes = Date.now();
    await advanceConversation({ ...base, text: "oi" });
    const prazo = new Date(gravado().variables.__wait_until).getTime();
    expect(prazo).toBeGreaterThanOrEqual(antes + 30 * 60_000);

    db.conversation.upsert.mockResolvedValue(parado("bloco", { __wait_until: new Date(prazo).toISOString() }));
    await advanceConversation({ ...base, text: "ana@exemplo.com" });
    expect(gravado().variables.__wait_until).toBeUndefined();
  });

  it("resposta inválida pede de novo e arma o prazo outra vez", async () => {
    db.agentFlow.findUnique.mockResolvedValue(comPrazo());
    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    await advanceConversation({ ...base, text: "não sei" });
    expect(gravado().variables.__wait_until).toEqual(expect.any(String));
  });

  it("acordado sem mensagem depois do prazo: sai por \"Não respondeu\"; sem ligação, continua parado", async () => {
    db.agentFlow.findUnique.mockResolvedValue(comPrazo({ sem_resposta: "Ainda está aí?" }));
    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    expect(textos(await advanceConversation(base))).toEqual(["Ainda está aí?"]);

    db.agentFlow.findUnique.mockResolvedValue(comPrazo());
    expect(textos(await advanceConversation(base))).toEqual([]);
    expect(gravado().currentNodeId).toBe("bloco");
  });

  it("chamada sem mensagem antes do prazo não sai por \"Não respondeu\"", async () => {
    db.agentFlow.findUnique.mockResolvedValue(comPrazo({ sem_resposta: "Ainda está aí?" }));
    db.conversation.upsert.mockResolvedValue(parado("bloco", { __wait_until: new Date(Date.now() + 60_000).toISOString() }));
    expect(textos(await advanceConversation(base))).not.toContain("Ainda está aí?");
  });
});

describe("Bloco do Studio: mídia, link e localização", () => {
  it("mídia sai com a URL (legenda no texto), link e localização viram texto, e os botões vão num texto depois da mídia", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({
        blockContents: [
          { id: "c1", type: "link", text: "Veja o catálogo", url: "https://exemplo.com/{plano}" },
          { id: "c2", type: "location", text: "Loja Centro", address: "Rua A, 10", latitude: -26.9, longitude: -48.6 },
          { id: "c3", type: "location", address: "Av. B, 20" },
          { id: "c4", type: "media", mediaType: "document", url: "https://exemplo.com/catalogo.pdf", fileName: "catalogo.pdf", text: "Catálogo" },
          { id: "c5", type: "media", url: "ftp://nao-serve" },
        ],
        waitForReply: true,
        options: [{ id: "s", label: "Quero" }],
      })
    );
    db.conversation.upsert.mockResolvedValue(parado(null, { plano: "pro" }));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages).toEqual([
      { text: "Veja o catálogo\nhttps://exemplo.com/pro" },
      {
        text: "Loja Centro\nRua A, 10\nhttps://www.google.com/maps?q=-26.9,-48.6",
        location: { latitude: -26.9, longitude: -48.6, name: "Loja Centro", address: "Rua A, 10" },
      },
      { text: "Av. B, 20\nhttps://www.google.com/maps/search/?api=1&query=Av.%20B%2C%2020" },
      { text: "Catálogo", media: { type: "document", url: "https://exemplo.com/catalogo.pdf", name: "catalogo.pdf" } },
      { text: "Escolha uma opção:", options: [{ id: "s", label: "Quero" }] },
    ]);
  });
});

describe("Bloco do Studio: carrossel, localização, figurinha e upload", () => {
  it("carrossel leva os cards e, no texto, a lista com links; card sem título e botão sem link ficam de fora", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({
        blockContents: [
          {
            id: "c1",
            type: "carousel",
            cards: [
              {
                id: "k1",
                title: "Plano {plano}",
                description: "Tudo incluso",
                imageUrl: "https://exemplo.com/pro.png",
                buttons: [
                  { id: "b1", label: "Assinar", url: "https://exemplo.com/assinar" },
                  { id: "b2", label: "Ruim", url: "javascript:alert(1)" },
                ],
              },
              { id: "k2", title: "Básico", imageUrl: "nao-e-url", buttons: [] },
              { id: "k3", title: "  ", buttons: [] },
            ],
          },
        ],
      })
    );
    db.conversation.upsert.mockResolvedValue(parado(null, { plano: "Pro" }));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages[0]).toEqual({
      text: "1. Plano Pro\nTudo incluso\nAssinar: https://exemplo.com/assinar\n\n2. Básico",
      cards: [
        { title: "Plano Pro", subtitle: "Tudo incluso", imageUrl: "https://exemplo.com/pro.png", buttons: [{ label: "Assinar", url: "https://exemplo.com/assinar" }] },
        { title: "Básico", subtitle: undefined, imageUrl: undefined, buttons: [] },
      ],
    });
  });

  it("pedir localização: a pergunta sai com o pedido nativo e a resposta fica em {localizacao}", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({ blockContents: [{ id: "c1", type: "text", text: "Onde você está?" }], waitForReply: true, captureField: "location" })
    );
    db.conversation.upsert.mockResolvedValue(parado(null));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages).toEqual([{ text: "Onde você está?", requestLocation: true }]);

    db.conversation.upsert.mockResolvedValue(parado("bloco"));
    const pino = "[Localização] https://maps.google.com/?q=-26.9,-48.6";
    expect(textos(await advanceConversation({ ...base, text: pino }))).toEqual(["Seguiu pelo padrão."]);
    expect(gravado().variables.localizacao).toBe(pino);
  });

  it("pedir localização sem texto no conteúdo: pergunta padrão com o pedido", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ blockContents: [], waitForReply: true, captureField: "location" }));
    db.conversation.upsert.mockResolvedValue(parado(null));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages).toEqual([{ text: "Pode me mandar a sua localização?", requestLocation: true }]);
  });

  it("figurinha sai sem legenda; arquivo enviado sai com link assinado e caminho; caminho de outra org não sai", async () => {
    db.agentFlow.findUnique.mockResolvedValue(
      fluxo({
        blockContents: [
          { id: "c1", type: "media", mediaType: "sticker", url: "https://exemplo.com/oi.webp", text: "ignorada" },
          { id: "c2", type: "media", mediaType: "image", path: "o1/2026/10/foto.png", fileName: "foto.png", text: "Foto" },
          { id: "c3", type: "media", mediaType: "image", path: "outra/2026/10/foto.png" },
        ],
      })
    );
    db.conversation.upsert.mockResolvedValue(parado(null));
    const r = await advanceConversation({ ...base, text: "oi" });
    expect(r.messages.slice(0, 2)).toEqual([
      { text: "", media: { type: "sticker", url: "https://exemplo.com/oi.webp" } },
      {
        text: "Foto",
        media: { type: "image", url: "https://storage.test/sign/o1/2026/10/foto.png?token=t", name: "foto.png", path: "o1/2026/10/foto.png" },
      },
    ]);
    expect(textos(r)).toEqual(["", "Foto", "Seguiu pelo padrão."]);
  });
});
