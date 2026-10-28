import { describe, it, expect, vi, beforeEach } from "vitest";
type Def = { id: string; entity: string; key: string; type: string; label?: string; options: { value: string; label: string }[] };
const db = vi.hoisted(() => ({
  defs: [] as Def[],
  customField: {
    findMany: vi.fn(async () => db.defs),
    count: vi.fn(async ({ where }: { where: { entity: string } }) => db.defs.filter((d) => d.entity === where.entity).length),
    create: vi.fn(async ({ data }: { data: Def }) => ({ ...data, id: `new-${data.key}` })),
    update: vi.fn(async (_args: { data: { options: { value: string }[] } }) => ({})),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/custom-fields", () => ({ gerarChaveUnica: async (_o: string, _e: string, label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_") }));
import { CREATE_FIELD, resolveFieldMap, sameSecret, suggestStages } from "./connection";

describe("suggestStages", () => {
  it("liga papel pelo nome da etapa, sem acento nem maiúscula", () => {
    const r = suggestStages([{ id: "1", name: "Membro ativo" }, { id: "2", name: "Pagamento Pendente" }, { id: "3", name: "Etapa nova" }, { id: "4", name: "Ex-Membro" }]);
    expect(r).toEqual({ active: "1", overdue: "2", former: "4" });
  });
});

describe("sameSecret", () => {
  it("só aceita igual e não vazio", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});

describe("resolveFieldMap", () => {
  const products = { "1": { slug: "curso", name: "Curso", model: "one_time" as const, pipelineId: "p", stages: {} } };
  beforeEach(() => {
    vi.clearAllMocks();
    db.defs = [];
  });

  it("contrato novo: cria os obrigatórios mesmo sem escolha e o que foi pedido", async () => {
    const r = await resolveFieldMap("o1", {}, { ltv_hotmart: CREATE_FIELD, cupom: "" }, products);
    expect(r.errors).toEqual([]);
    const criados = db.customField.create.mock.calls.map((c) => (c[0] as { data: Def }).data.label);
    expect(criados).toEqual(expect.arrayContaining(["LTV Hotmart", "Último evento Hotmart", "Transação Hotmart"]));
    expect(r.map).toMatchObject({ ltv_hotmart: "ltv_hotmart", cupom: null, transacao_hotmart: "transacao_hotmart" });
  });

  it("primeiro salvar dos produtos (sem escolhas): cria os essenciais, não os opcionais", async () => {
    const r = await resolveFieldMap("o1", {}, undefined, products);
    const criados = db.customField.create.mock.calls.map((c) => (c[0] as { data: Def }).data.key);
    expect(criados).toEqual(expect.arrayContaining(["produtos_comprados", "cpf_cnpj", "ltv_hotmart", "teve_chargeback", "canal_de_origem", "motivo_da_perda", "data_de_aprovacao", "forma_de_pagamento"]));
    expect(criados).not.toContain("cupom");
    expect(r.map).not.toHaveProperty("cupom");
  });

  it("essencial marcado como Não gravar não volta a ser criado", async () => {
    await resolveFieldMap("o1", { ltv_hotmart: null }, undefined, products);
    const criados = db.customField.create.mock.calls.map((c) => (c[0] as { data: Def }).data.key);
    expect(criados).not.toContain("ltv_hotmart");
  });

  it("campo de mesma chave é reaproveitado; campo do cliente recebe as opções que faltam", async () => {
    db.defs = [
      { id: "f1", entity: "deal", key: "ultimo_evento_hotmart", type: "text", options: [] },
      { id: "f2", entity: "deal", key: "transacao_hotmart", type: "text", options: [] },
      { id: "f3", entity: "deal", key: "origem", type: "select", options: [{ value: "site", label: "Site" }] },
    ];
    const r = await resolveFieldMap("o1", {}, { canal_de_origem: "origem" }, products);
    const criados = db.customField.create.mock.calls.map((c) => (c[0] as { data: Def }).data.key);
    expect(criados).not.toContain("ultimo_evento_hotmart");
    expect(criados).not.toContain("transacao_hotmart");
    expect(criados).not.toContain("canal_de_origem");
    expect(r.map.canal_de_origem).toBe("origem");
    const opcoes = db.customField.update.mock.calls[0][0].data.options.map((o) => o.value);
    expect(opcoes).toContain("afiliado");
    expect(opcoes.filter((v) => v === "site")).toHaveLength(1);
  });

  it("campo que a regra usa (transação) não recebe outro dado", async () => {
    db.defs = [{ id: "f2", entity: "deal", key: "transacao_hotmart", type: "text", options: [] }];
    const r = await resolveFieldMap("o1", {}, { cupom: "transacao_hotmart" }, products);
    expect(r.errors[0]).toMatch(/^Cupom/);
  });

  it("campo de tipo errado vira erro com o nome do dado", async () => {
    db.defs = [{ id: "f1", entity: "contact", key: "valor", type: "text", options: [] }];
    const r = await resolveFieldMap("o1", {}, { ltv_hotmart: "valor" }, products);
    expect(r.errors[0]).toMatch(/^LTV Hotmart/);
  });
});
