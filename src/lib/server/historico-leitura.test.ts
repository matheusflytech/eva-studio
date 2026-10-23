import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinhaDoHistorico } from "@/lib/historico/tipos";

const db = vi.hoisted(() => ({
  profile: { findMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  pipeline: { findMany: vi.fn() },
  company: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  customField: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { itensDoHistorico } from "./historico-leitura";

const linha = (extra: Partial<LinhaDoHistorico>): LinhaDoHistorico => ({
  id: "h1",
  acao: "alterou",
  objeto: "deal",
  objetoId: "d1",
  objetoNome: "Acme",
  mudancas: null,
  detalhes: {},
  atorTipo: "usuario",
  atorId: "u1",
  atorNome: "Ana",
  em: "2026-10-23T12:00:00.000Z",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of Object.values(db)) m.findMany.mockResolvedValue([]);
});

describe("itensDoHistorico", () => {
  it("nomes buscados dentro da org; registro que sumiu vem como apagado", async () => {
    db.profile.findMany.mockResolvedValue([{ id: "u2", name: "Bruno" }]);
    db.customField.findMany.mockResolvedValue([{ entity: "deal", key: "origem", label: "Origem", type: "text", options: [] }]);
    const itens = await itensDoHistorico("o1", [
      linha({ mudancas: { owner_id: { de: null, para: "u2" }, "custom_fields.origem": { de: "a", para: "b" } } }),
    ]);
    expect(db.customField.findMany.mock.calls[0][0].where).toEqual({ orgId: "o1", entity: { in: ["deal"] } });
    expect(db.deal.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["d1"] }, orgId: "o1" });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      resumo: "Alterou 2 campos",
      existe: false,
      mudancas: [
        { campo: "owner_id", rotulo: "Responsável", de: "vazio", para: "Bruno" },
        { campo: "custom_fields.origem", rotulo: "Origem", de: "a", para: "b" },
      ],
    });
  });

  it("na ficha (semEtapa), a alteração que só mudou a etapa some", async () => {
    db.deal.findMany.mockResolvedValue([{ id: "d1" }]);
    const so = linha({ id: "h1", mudancas: { stage_id: { de: "s1", para: "s2" }, status: { de: "open", para: "won" } } });
    const com = linha({ id: "h2", mudancas: { stage_id: { de: "s1", para: "s2" }, name: { de: "A", para: "B" } } });
    const itens = await itensDoHistorico("o1", [so, com], { semEtapa: true });
    expect(itens.map((i) => i.id)).toEqual(["h2"]);
    expect(itens[0]).toMatchObject({ existe: true, resumo: "Alterou 1 campo" });
    expect(db.pipelineStage.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["s1", "s2"] }, pipeline: { orgId: "o1" } });
  });

  it("lista vazia não consulta nada", async () => {
    expect(await itensDoHistorico("o1", [])).toEqual([]);
    expect(db.deal.findMany).not.toHaveBeenCalled();
  });
});
