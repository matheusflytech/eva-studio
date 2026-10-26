import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmToolCall } from "@/lib/server/llm";

// crm_registrar_lead: nome, telefone e e-mail da ferramenta chegam ao contato
// (pelas variáveis da conversa, que o fim da rodada grava) e a pessoa vira lead.
// Antes o nome só ia para o título do negócio e o contato ficava vazio.

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentSubflow: { findMany: vi.fn(async () => []) },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
  message: { findMany: vi.fn(async () => []) },
  knowledgeDoc: { findMany: vi.fn(async () => []) },
}));
const llm = vi.hoisted(() => ({ callLlmWithTools: vi.fn() }));
const contatos = vi.hoisted(() => ({
  syncContactFromConversation: vi.fn(async (_input: { variables: Record<string, unknown> }) => "contato-1"),
}));
const leads = vi.hoisted(() => ({ marcarComoLead: vi.fn() }));
const crm = vi.hoisted(() => ({
  createDeal: vi.fn(async () => ({ id: "negocio-1" })),
  findOpenDealForContact: vi.fn(async () => null),
  preencherCamposDoNegocio: vi.fn(async () => ({ aplicados: 0, erros: [] })),
  preencherCamposDoContato: vi.fn(async () => ({ aplicados: 0, erros: [] })),
  addNote: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
vi.mock("@/lib/server/contacts", () => contatos);
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => leads);
vi.mock("@/lib/server/crm", () => crm);
vi.mock("@/lib/server/custom-fields", () => ({ carregarDefinicoes: vi.fn(async () => []) }));
vi.mock("@/lib/server/credentials", () => ({ getCredentialSecret: vi.fn(async () => "chave") }));
vi.mock("@/lib/server/llm", () => llm);
vi.mock("@/lib/server/ia/uso", () => ({ chavesNoLimite: vi.fn(async () => new Set<string>()), registrarUso: vi.fn() }));

import { advanceConversation } from "./flow-engine";

const fluxo = {
  agentId: "a1",
  nodes: [
    { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
    { id: "bot", position: { x: 0, y: 0 }, data: { iconKey: "ai-agent", label: "IA", aiCredentialId: "cred", detail: "Atenda." } },
    { id: "crm", position: { x: 0, y: 0 }, data: { iconKey: "tool-crm", label: "CRM", crmToolActions: ["registrar_lead"] } },
  ],
  edges: [
    { id: "e1", source: "start", target: "bot" },
    { id: "e2", source: "crm", target: "bot", targetHandle: "tools" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1", name: "Eva", outboundUrl: "" });
  db.agentFlow.findUnique.mockResolvedValue(fluxo);
  db.conversation.upsert.mockResolvedValue({
    id: "c1", status: "active", currentNodeId: "bot", variables: {}, lastContactMessageAt: null, contactRecordId: null,
  });
});

describe("crm_registrar_lead", () => {
  it("oferece telefone e e-mail; grava nome/telefone/e-mail no contato e marca como lead", async () => {
    let ferramentas: { name: string; params: { name: string }[] }[] = [];
    llm.callLlmWithTools.mockImplementation(
      async (opts: { executeTool: (c: LlmToolCall) => Promise<string>; tools: typeof ferramentas }) => {
        ferramentas = opts.tools;
        await opts.executeTool({
          id: "1",
          name: "crm_registrar_lead",
          arguments: { nome: "Ana Souza", telefone: "(47) 99970-5773", email: " ", resumo: "Quer um agente" },
        });
        return { text: "Obrigada, Ana!" };
      }
    );
    await advanceConversation({ agentId: "a1", channel: "website", contactId: "site-1", text: "sou a Ana, (47) 99970-5773" });

    const params = ferramentas.find((t) => t.name === "crm_registrar_lead")!.params.map((p) => p.name);
    expect(params).toEqual(expect.arrayContaining(["nome", "telefone", "email"]));
    expect(crm.createDeal).toHaveBeenCalledWith(expect.objectContaining({ name: "Lead do site: Ana Souza", contactId: "contato-1" }));
    const ultimaSync = contatos.syncContactFromConversation.mock.calls.at(-1)![0];
    expect(ultimaSync.variables).toMatchObject({ nome: "Ana Souza", telefone: "(47) 99970-5773" });
    expect(ultimaSync.variables).not.toHaveProperty("email");
    expect(leads.marcarComoLead).toHaveBeenCalledWith("contato-1", expect.objectContaining({ channel: "website" }));
  });
});
