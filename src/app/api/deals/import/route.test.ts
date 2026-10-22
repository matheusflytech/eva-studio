import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
}));
const linhas = vi.hoisted(() => ({
  linhasDoCsv: vi.fn(() => [{ row: 2, record: { name: "A" } }]),
  processarLinha: vi.fn(async () => ({ result: "updated", id: "d1" })),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({ requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u" })) }));
vi.mock("@/lib/server/api-v1/linhas", () => linhas);

import { POST } from "./route";

const enviar = (corpo: unknown) => POST(new Request("http://x/api/deals/import", { method: "POST", body: JSON.stringify(corpo) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.pipeline.findFirst.mockResolvedValue({ id: "p1", stages: [{ id: "s1" }] });
});

describe("POST /api/deals/import — regras da etapa", () => {
  it("sem a flag, a importação segue as regras (ignorarObrigatorios false)", async () => {
    await enviar({ csv: "nome\nA", pipelineId: "p1" });
    expect(linhas.processarLinha).toHaveBeenCalledWith("org", "deals", expect.anything(), expect.objectContaining({ ignorarObrigatorios: false }));
  });

  it("com a flag explícita, passa adiante (vira ignorouObrigatorios no DealStageEvent)", async () => {
    await enviar({ csv: "nome\nA", pipelineId: "p1", ignorarObrigatorios: true });
    expect(linhas.processarLinha).toHaveBeenCalledWith("org", "deals", expect.anything(), expect.objectContaining({ ignorarObrigatorios: true }));
  });
});
