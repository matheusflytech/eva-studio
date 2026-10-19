import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { LAYOUT_PADRAO } from "@/lib/cartao-layout";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  customField: { findMany: vi.fn() },
  pipelineCardLayout: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const auth = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { GET, PUT } from "./route";

const params = (id = "p1") => ({ params: Promise.resolve({ id }) });
const get = (id?: string) => GET(new Request("http://x/api/pipelines/p1/cartao"), params(id));
const put = (body: unknown, id?: string) =>
  PUT(
    new Request("http://x/api/pipelines/p1/cartao", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }),
    params(id)
  );

const campo = (key: string, showOnCard = false) => ({
  id: `f-${key}`,
  entity: "deal",
  pipelineId: null,
  key,
  label: key,
  type: "text",
  options: [],
  required: false,
  helpText: "",
  showOnCard,
  position: 0,
});

const tabelaInexistente = () =>
  new Prisma.PrismaClientKnownRequestError("The table `eva_studio_pipeline_card_layouts` does not exist", {
    code: "P2021",
    clientVersion: "7",
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ orgId: "org", userId: "u", role: "owner" });
  db.pipeline.findFirst.mockResolvedValue({ id: "p1" });
  db.customField.findMany.mockResolvedValue([campo("origem", true), campo("segmento")]);
  db.pipelineCardLayout.findUnique.mockResolvedValue(null);
  db.pipelineCardLayout.upsert.mockResolvedValue({});
});

describe("GET /api/pipelines/[id]/cartao", () => {
  it("tabela ausente → padrão com os campos legados, salvo false", async () => {
    db.pipelineCardLayout.findUnique.mockRejectedValue(tabelaInexistente());
    const res = await get();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.salvo).toBe(false);
    expect(d.disponivel).toBe(false);
    expect(d.layout.campos).toEqual([...LAYOUT_PADRAO.campos, "cf:origem"]);
    expect(d.layout.previa).toContain("cf:origem");
    expect(d.layout.densidade).toBe("confortavel");
  });

  it("layout salvo é normalizado (campo personalizado apagado sai)", async () => {
    db.pipelineCardLayout.findUnique.mockResolvedValue({
      layout: { campos: ["valor", "cf:segmento", "cf:sumiu"], previa: ["email"], densidade: "compacto" },
    });
    const d = await (await get()).json();
    expect(d.salvo).toBe(true);
    expect(d.disponivel).toBe(true);
    expect(d.layout).toEqual({ campos: ["valor", "cf:segmento"], previa: ["email"], densidade: "compacto" });
    expect(db.pipeline.findFirst).toHaveBeenCalledWith({ where: { id: "p1", orgId: "org" }, select: { id: true } });
  });

  it("funil de outra org → 404", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    expect((await get("p-outra")).status).toBe(404);
  });
});

describe("PUT /api/pipelines/[id]/cartao", () => {
  const valido = { campos: ["empresa", "valor", "cf:segmento"], previa: ["telefone", "valor"], densidade: "compacto" };

  it("salva por funil e devolve o layout", async () => {
    const res = await put(valido);
    expect(res.status).toBe(200);
    expect((await res.json()).layout).toEqual(valido);
    expect(db.pipelineCardLayout.upsert).toHaveBeenCalledWith({
      where: { pipelineId: "p1" },
      create: { orgId: "org", pipelineId: "p1", layout: valido },
      update: { layout: valido },
    });
  });

  it("campo desconhecido → 400, sem gravar", async () => {
    const res = await put({ ...valido, campos: ["valor", "cf:nao-existe"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Campo desconhecido/);
    expect(db.pipelineCardLayout.upsert).not.toHaveBeenCalled();
  });

  it("densidade inválida e JSON inválido → 400", async () => {
    expect((await put({ ...valido, densidade: "gigante" })).status).toBe(400);
    expect((await put("{ruim")).status).toBe(400);
    expect(db.pipelineCardLayout.upsert).not.toHaveBeenCalled();
  });

  it("funil de outra org → 404", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    const res = await put(valido, "p-outra");
    expect(res.status).toBe(404);
    expect(db.pipelineCardLayout.upsert).not.toHaveBeenCalled();
  });

  it("viewer → 403", async () => {
    auth.requirePermission.mockImplementation(async (p: string) =>
      p === "agents:manage" ? { error: "Sem permissão.", status: 403 } : { orgId: "org", userId: "u", role: "viewer" }
    );
    const res = await put(valido);
    expect(res.status).toBe(403);
    expect(auth.requirePermission).toHaveBeenCalledWith("agents:manage");
    expect(db.pipelineCardLayout.upsert).not.toHaveBeenCalled();
    // Ler continua liberado.
    expect((await get()).status).toBe(200);
  });

  it("tabela ausente → 503 com mensagem clara", async () => {
    db.pipelineCardLayout.upsert.mockRejectedValue(tabelaInexistente());
    const res = await put(valido);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("A personalização do cartão ainda não foi ativada no banco.");
  });
});
