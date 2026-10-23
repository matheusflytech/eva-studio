import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { LAYOUT_PADRAO } from "@/lib/cartao-layout";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  customField: { findMany: vi.fn() },
  pipelineCardLayout: { findUnique: vi.fn() },
  userCardLayout: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { DELETE, GET, PUT } from "./route";

const params = (id = "p1") => ({ params: Promise.resolve({ id }) });
const url = "http://x/api/pipelines/p1/cartao/meu";
const ausente = () => new Prisma.PrismaClientKnownRequestError("relation eva_studio_user_card_layouts does not exist", { code: "P2021", clientVersion: "7" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "org", role: "agent" });
  db.pipeline.findFirst.mockResolvedValue({ id: "p1" });
  db.customField.findMany.mockResolvedValue([]);
  db.pipelineCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["valor"], previa: [], densidade: "compacto" } });
  db.userCardLayout.findUnique.mockResolvedValue(null);
});

describe("layout da pessoa", () => {
  it("GET sem escolha própria: vale o do funil", async () => {
    const d = await (await GET(new Request(url), params())).json();
    expect(d).toMatchObject({ proprio: false, disponivel: true, layout: { campos: ["valor"] }, doFunil: { campos: ["valor"] } });
    expect(db.userCardLayout.findUnique).toHaveBeenCalledWith({ where: { userId_pipelineId: { userId: "u1", pipelineId: "p1" } }, select: { layout: true } });
  });

  it("GET com escolha própria: vale a da pessoa, e o do funil vem junto para o 'voltar ao padrão'", async () => {
    db.userCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["contato", "valor"], previa: [], densidade: "confortavel", secoes: ["atividade"] } });
    const d = await (await GET(new Request(url), params())).json();
    expect(d.proprio).toBe(true);
    expect(d.layout).toMatchObject({ campos: ["contato", "valor"], secoes: ["atividade"] });
    expect(d.doFunil.campos).toEqual(["valor"]);
  });

  it("PUT grava só para a pessoa da sessão (userId do corpo é ignorado)", async () => {
    const corpo = { ...LAYOUT_PADRAO, userId: "outra" };
    const res = await PUT(new Request(url, { method: "PUT", body: JSON.stringify(corpo) }), params());
    expect(res.status).toBe(200);
    const arg = db.userCardLayout.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_pipelineId: { userId: "u1", pipelineId: "p1" } });
    expect(arg.create).toMatchObject({ orgId: "org", userId: "u1", pipelineId: "p1" });
    expect(arg.create.layout).not.toHaveProperty("userId");
  });

  it("PUT inválido: 400; funil de outra org: 404", async () => {
    const r = await PUT(new Request(url, { method: "PUT", body: JSON.stringify({ ...LAYOUT_PADRAO, acoes: ["fax"] }) }), params());
    expect(r.status).toBe(400);
    db.pipeline.findFirst.mockResolvedValue(null);
    expect((await PUT(new Request(url, { method: "PUT", body: JSON.stringify(LAYOUT_PADRAO) }), params("p-x"))).status).toBe(404);
    expect(db.userCardLayout.upsert).not.toHaveBeenCalled();
  });

  it("DELETE volta ao padrão do funil, só o da pessoa", async () => {
    db.userCardLayout.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(new Request(url, { method: "DELETE" }), params())).status).toBe(200);
    expect(db.userCardLayout.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", pipelineId: "p1" } });
  });

  it("sem a tabela: GET diz indisponível e o do funil vale; PUT 503", async () => {
    db.userCardLayout.findUnique.mockRejectedValue(ausente());
    const d = await (await GET(new Request(url), params())).json();
    expect(d).toMatchObject({ disponivel: false, proprio: false, layout: { campos: ["valor"] } });
    db.userCardLayout.upsert.mockRejectedValue(ausente());
    expect((await PUT(new Request(url, { method: "PUT", body: JSON.stringify(LAYOUT_PADRAO) }), params())).status).toBe(503);
  });
});
