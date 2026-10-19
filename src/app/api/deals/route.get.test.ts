import { describe, it, expect, vi, beforeEach } from "vitest";
import { LAYOUT_PADRAO } from "@/lib/cartao-layout";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  deal: { findMany: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
  pipelineCardLayout: { findUnique: vi.fn() },
  dealItem: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "viewer" })),
}));

import { GET } from "./route";

const get = () => GET(new Request("http://x/api/deals?pipeline=p1"));

beforeEach(() => {
  vi.clearAllMocks();
  db.pipeline.findFirst.mockResolvedValue({
    id: "p1",
    name: "Vendas",
    stages: [{ id: "s1", name: "Novo", type: "open", color: "blue", probability: 10 }],
  });
  db.deal.findMany.mockResolvedValue([
    {
      id: "d1",
      name: "Negócio",
      stageId: "s1",
      amountCents: 1000,
      currency: "BRL",
      probability: 10,
      company: null,
      owner: null,
      contacts: [{ contact: { id: "k1", name: "Marina", phone: "+5511999", email: "m@x.com", conversations: [] } }],
      tasks: [],
      _count: { tasks: 0 },
      customFields: {},
      expectedClosingAt: null,
      closedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      stageSince: new Date("2026-10-02T00:00:00Z"),
    },
  ]);
});

describe("GET /api/deals", () => {
  it("tabela do cartão ausente não quebra o quadro: layout padrão", async () => {
    db.pipelineCardLayout.findUnique.mockRejectedValue(new Error('relation "eva_studio_pipeline_card_layouts" does not exist'));
    const res = await get();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.layout).toEqual(LAYOUT_PADRAO);
    expect(d.stages[0].deals[0].contacts).toEqual([{ id: "k1", name: "Marina", phone: "+5511999", email: "m@x.com" }]);
    expect(d.stages[0].deals[0].createdAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("devolve o layout salvo do funil", async () => {
    db.pipelineCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["valor"], previa: [], densidade: "compacto" } });
    const d = await (await get()).json();
    expect(d.layout).toEqual({ campos: ["valor"], previa: [], densidade: "compacto" });
    expect(db.pipelineCardLayout.findUnique).toHaveBeenCalledWith({ where: { pipelineId: "p1" }, select: { layout: true } });
  });

  it("layout sem produtos: nem consulta os itens", async () => {
    db.pipelineCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["valor"], previa: [], densidade: "compacto" } });
    const d = await (await get()).json();
    expect(db.dealItem.findMany).not.toHaveBeenCalled();
    expect(d.stages[0].deals[0].produtos).toBeUndefined();
  });

  it("layout com produtos: traz os nomes dos itens de cada negócio", async () => {
    db.pipelineCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["valor", "produtos"], previa: [], densidade: "compacto" } });
    db.dealItem.findMany.mockResolvedValue([{ dealId: "d1", name: "Plano Pro" }]);
    const d = await (await get()).json();
    expect(d.stages[0].deals[0].produtos).toEqual(["Plano Pro"]);
    expect(db.dealItem.findMany.mock.calls[0][0].where).toEqual({ orgId: "org", dealId: { in: ["d1"] } });
  });

  it("tabela de itens ausente não quebra o quadro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.pipelineCardLayout.findUnique.mockResolvedValue({ layout: { campos: ["produtos"], previa: [], densidade: "compacto" } });
    db.dealItem.findMany.mockRejectedValue(new Error('relation "eva_studio_deal_items" does not exist'));
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).stages[0].deals[0].produtos).toEqual([]);
  });
});
