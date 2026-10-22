import { describe, it, expect, vi, beforeEach } from "vitest";

const barramento = vi.hoisted(() => ({ publicarEvento: vi.fn() }));
const negocios = vi.hoisted(() => ({ carregarNegocio: vi.fn(), serializarNegocios: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./barramento", () => barramento);
vi.mock("@/lib/server/api-v1/negocios", () => negocios);

import { diferencas, publicarAlteracao } from "./alteracoes";

beforeEach(() => vi.clearAllMocks());

describe("diferencas", () => {
  it("só o que mudou; campos personalizados um a um; ignora carimbos de data", () => {
    const antes = { name: "A", amount_cents: 100, custom_fields: { cpf: "1", cidade: "SP" }, updated_at: "x", last_seen_at: "y" };
    const depois = { name: "A", amount_cents: 200, custom_fields: { cpf: "1", cidade: "RJ", novo: true }, updated_at: "z", last_seen_at: "w" };
    expect(diferencas(antes, depois)).toEqual({
      amount_cents: { de: 100, para: 200 },
      "custom_fields.cidade": { de: "SP", para: "RJ" },
      "custom_fields.novo": { de: null, para: true },
    });
  });

  it("lista de etiquetas compara pelos ids, sem ligar para a ordem", () => {
    const a = { tags: [{ id: "t1", name: "VIP" }, { id: "t2", name: "Quente" }] };
    expect(diferencas(a, { tags: [{ id: "t2", name: "Quente" }, { id: "t1", name: "VIP!" }] })).toEqual({});
    expect(Object.keys(diferencas(a, { tags: [{ id: "t1", name: "VIP" }] }))).toEqual(["tags"]);
  });

  it("null e ausente são iguais", () => {
    expect(diferencas({ owner_id: null }, {})).toEqual({});
  });
});

describe("publicarAlteracao", () => {
  const foto = (over: Record<string, unknown>) => {
    negocios.carregarNegocio.mockResolvedValue({ id: "d1" });
    negocios.serializarNegocios.mockResolvedValue([{ id: "d1", name: "A", owner_id: "u1", ...over }]);
  };

  it("publica deal.updated com o diff e deal.owner_changed quando muda o responsável", async () => {
    foto({ owner_id: "u2", name: "B" });
    const diff = await publicarAlteracao("o1", "deal", "d1", { id: "d1", name: "A", owner_id: "u1" });
    expect(diff).toEqual({ name: { de: "A", para: "B" }, owner_id: { de: "u1", para: "u2" } });
    expect(barramento.publicarEvento.mock.calls.map((c) => c[0].tipo)).toEqual(["deal.updated", "deal.owner_changed"]);
    expect(barramento.publicarEvento.mock.calls[1][0].diff).toEqual({ owner_id: { de: "u1", para: "u2" } });
  });

  it("nada mudou ou sem foto de antes: não publica", async () => {
    foto({});
    expect(await publicarAlteracao("o1", "deal", "d1", { id: "d1", name: "A", owner_id: "u1" })).toBeNull();
    expect(await publicarAlteracao("o1", "deal", "d1", null)).toBeNull();
    expect(barramento.publicarEvento).not.toHaveBeenCalled();
  });
});
