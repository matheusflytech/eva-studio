import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  metaConnection: { findUnique: vi.fn() },
  messageTemplate: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrgId: vi.fn(async () => "o1") }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ userId: "u1", orgId: "o1", role: "admin" })),
}));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => `dec(${s})` }));

const criar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/meta-templates", () => ({ criarTemplateNaMeta: criar }));

import { POST, GET } from "./route";

const params = Promise.resolve({ agentId: "a1" });
const req = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

const formulario = {
  nome: "lembrete_consulta",
  categoria: "UTILITY",
  idioma: "pt_BR",
  header: { formato: "NONE" },
  corpo: "Oi {nome}, sua consulta é {{2}}.",
  exemplos: { nome: "Ana", "2": "amanhã às 9h" },
  mapa: { "2": "data_consulta" },
  rodape: "",
  botoes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.metaConnection.findUnique.mockResolvedValue({ agentId: "a1", wabaId: "waba1", accessToken: "tok" });
  db.messageTemplate.findFirst.mockResolvedValue(null);
  db.messageTemplate.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "t1", ...data }));
});

describe("POST /api/agents/[agentId]/meta-templates", () => {
  it("valida antes de chamar a Meta", async () => {
    const res = await POST(req({ ...formulario, nome: "Lembrete Consulta" }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.erros.some((e: { campo: string }) => e.campo === "nome")).toBe(true);
    expect(criar).not.toHaveBeenCalled();
  });

  it("sem WhatsApp oficial: 400", async () => {
    db.metaConnection.findUnique.mockResolvedValue(null);
    const res = await POST(req(formulario), { params });
    expect(res.status).toBe(400);
    expect(criar).not.toHaveBeenCalled();
  });

  it("cria na Meta e grava o modelo local ligado ao template, em análise", async () => {
    criar.mockResolvedValue({ ok: true, id: "987", status: "PENDING", category: "UTILITY" });
    const res = await POST(req(formulario), { params });
    expect(res.status).toBe(200);

    const [waba, token, payload] = criar.mock.calls[0];
    expect(waba).toBe("waba1");
    expect(token).toBe("dec(tok)");
    expect(payload.components[0]).toEqual({
      type: "BODY",
      text: "Oi {{1}}, sua consulta é {{2}}.",
      example: { body_text: [["Ana", "amanhã às 9h"]] },
    });

    const data = db.messageTemplate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      agentId: "a1",
      name: "lembrete_consulta",
      category: "utility",
      bodyText: "Oi {nome}, sua consulta é {data_consulta}.",
      metaTemplateName: "lembrete_consulta",
      metaLanguageCode: "pt_BR",
      variableOrder: ["nome", "data_consulta"],
      metaTemplateId: "987",
      metaStatus: "PENDING",
    });
  });

  it("erro da Meta volta legível e não grava nada", async () => {
    criar.mockResolvedValue({ ok: false, erro: "A Meta recusou: x" });
    const res = await POST(req(formulario), { params });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("A Meta recusou: x");
    expect(db.messageTemplate.create).not.toHaveBeenCalled();
  });

  it("nome já usado neste agente: recusa sem chamar a Meta", async () => {
    db.messageTemplate.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req(formulario), { params });
    expect(res.status).toBe(409);
    expect(criar).not.toHaveBeenCalled();
  });
});

describe("GET: consulta ao vivo com status gravado como reserva", () => {
  it("se a Meta não responde, usa o último status do webhook", async () => {
    db.messageTemplate.findMany.mockResolvedValue([
      {
        id: "t1", name: "x", metaTemplateName: "promo", metaLanguageCode: "pt_BR", bodyText: "b",
        metaStatus: "REJECTED", metaStatusReason: "INVALID_FORMAT", metaStatusAt: new Date("2026-10-20T10:00:00Z"),
      },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await GET(new Request("http://x"), { params });
    const json = await res.json();
    vi.unstubAllGlobals();

    expect(json.erro).toBeTruthy();
    expect(json.locais[0]).toMatchObject({
      situacao: "REJECTED",
      situacaoReserva: true,
      motivoGravado: "INVALID_FORMAT",
    });
  });
});
