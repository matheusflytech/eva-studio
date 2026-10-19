import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => ({
  teamMember: { findMany: vi.fn() },
  customField: { findMany: vi.fn() },
  segment: { findMany: vi.fn() },
  contact: { findMany: vi.fn(), count: vi.fn() },
  deal: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  idsDoFiltro,
  orderByDe,
  resolverConjunto,
  whereDeContatos,
  whereDeNegocios,
} from "./filtro-crm";
import { SEM_VALOR, type FiltroDeConsulta } from "@/lib/consulta";

const ctx = { userId: "u1", orgId: "o1" };
// 20/10/2026 02:30 UTC = 19/10 23:30 em São Paulo (o "hoje" de SP ainda é 19).
const agora = new Date("2026-10-20T02:30:00Z");
const DIA = 24 * 60 * 60 * 1000;
const NADA = { id: { in: [] } };

const um = (c: FiltroDeConsulta) => ({ logica: "e", grupos: [{ logica: "e", condicoes: [c] }] });

/** O pedaço do filtro (último item do AND) de um contato. */
async function wc(c: FiltroDeConsulta) {
  const w = await whereDeContatos(ctx, um(c), { agora });
  expect(w.avisos).toEqual([]);
  const and = (w.where as { AND?: unknown[] }).AND ?? [];
  return and[and.length - 1];
}

/** O pedaço do filtro de um negócio (o AND começa com archivedAt: null). */
async function wn(c: FiltroDeConsulta) {
  const w = await whereDeNegocios(ctx, um(c), { agora });
  expect(w.avisos).toEqual([]);
  const and = (w.where as { AND: unknown[] }).AND;
  expect(and[0]).toEqual({ archivedAt: null });
  return and.length > 1 ? and[and.length - 1] : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.teamMember.findMany.mockResolvedValue([{ userId: "u2" }]);
  db.customField.findMany.mockResolvedValue([]);
  db.segment.findMany.mockResolvedValue([]);
});

describe("contatos: cada campo × operador vira o where esperado", () => {
  it.each<[string, FiltroDeConsulta, unknown]>([
    ["nome contém", { campo: "nome", op: "contem", valor: "ana" }, { name: { contains: "ana", mode: "insensitive" } }],
    ["nome é", { campo: "nome", op: "eq", valor: "Ana" }, { name: { equals: "Ana", mode: "insensitive" } }],
    ["nome não contém", { campo: "nome", op: "naoContem", valor: "x" }, { NOT: { name: { contains: "x", mode: "insensitive" } } }],
    ["e-mail vazio", { campo: "email", op: "vazio" }, { email: "" }],
    ["e-mail preenchido", { campo: "email", op: "preenchido" }, { NOT: { email: "" } }],
    ["telefone preenchido", { campo: "telefone", op: "preenchido" }, { NOT: { phone: "" } }],
    ["responsável é u1 ou sem", { campo: "responsavel", op: "qualquer", valores: ["u1", SEM_VALOR] }, { OR: [{ ownerId: { in: ["u1"] } }, { ownerId: null }] }],
    ["responsável não é u1 (sem dono entra)", { campo: "responsavel", op: "nenhum", valores: ["u1"] }, { OR: [{ ownerId: null }, { ownerId: { notIn: ["u1"] } }] }],
    ["sem responsável", { campo: "responsavel", op: "vazio" }, { ownerId: null }],
    ["empresa é", { campo: "empresa", op: "qualquer", valores: ["e1"] }, { companyId: { in: ["e1"] } }],
    ["sem empresa", { campo: "empresa", op: "vazio" }, { companyId: null }],
    ["etiqueta qualquer", { campo: "etiqueta", op: "qualquer", valores: ["t1", "t2"] }, { tags: { some: { tagId: { in: ["t1", "t2"] } } } }],
    ["etiqueta todas", { campo: "etiqueta", op: "todos", valores: ["t1", "t2"] }, { AND: [{ tags: { some: { tagId: "t1" } } }, { tags: { some: { tagId: "t2" } } }] }],
    ["etiqueta nenhuma de", { campo: "etiqueta", op: "nenhum", valores: ["t1"] }, { tags: { none: { tagId: { in: ["t1"] } } } }],
    ["sem etiqueta", { campo: "etiqueta", op: "vazio" }, { tags: { none: {} } }],
    ["canal", { campo: "canal", op: "qualquer", valores: ["instagram"] }, { channels: { some: { channel: { in: ["instagram"] } } } }],
    ["sem canal", { campo: "canal", op: "vazio" }, { channels: { none: {} } }],
    ["opt-in sim", { campo: "optIn", op: "eq", valor: "true" }, { optIn: true }],
    ["opt-in não", { campo: "optIn", op: "eq", valor: "false" }, { optIn: false }],
    [
      "criado em (dia em SP)",
      { campo: "criadoEm", op: "entre", valor: "2026-10-01", ate: "2026-10-31" },
      { createdAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-11-01T03:00:00Z") } },
    ],
    [
      "última atividade nos últimos 7 dias (hoje = 19/10 em SP)",
      { campo: "ultimaAtividade", op: "ultimos", valor: "7" },
      { lastSeenAt: { gte: new Date("2026-10-13T03:00:00Z"), lt: new Date("2026-10-20T03:00:00Z") } },
    ],
    ["última atividade antes de", { campo: "ultimaAtividade", op: "antes", valor: "2026-01-01" }, { lastSeenAt: { lt: new Date("2026-01-01T03:00:00Z") } }],
  ])("%s", async (_, c, esperado) => {
    expect(await wc(c)).toEqual(esperado);
  });

  it("equipe: responsável numa equipe DESTE contrato; nenhum = NOT; vazio = sem dono ou sem equipe", async () => {
    const emT1 = { owner: { is: { teamMemberships: { some: { team: { orgId: "o1" }, teamId: { in: ["t1"] } } } } } };
    expect(await wc({ campo: "equipe", op: "qualquer", valores: ["t1"] })).toEqual(emT1);
    expect(await wc({ campo: "equipe", op: "nenhum", valores: ["t1"] })).toEqual({ NOT: emT1 });
    expect(await wc({ campo: "equipe", op: "vazio" })).toEqual({
      OR: [{ ownerId: null }, { NOT: { owner: { is: { teamMemberships: { some: { team: { orgId: "o1" } } } } } } }],
    });
  });

  it("segmento: regras do segmento do contrato; segmento de fora não pega ninguém", async () => {
    db.segment.findMany.mockResolvedValue([{ id: "s1", match: "all", rules: [{ field: "name", op: "contains", value: "x" }] }]);
    expect(await wc({ campo: "segmento", op: "qualquer", valores: ["s1"] })).toEqual({
      orgId: "o1",
      AND: [{ name: { contains: "x", mode: "insensitive" } }],
    });
    expect(db.segment.findMany).toHaveBeenCalledWith({ where: { orgId: "o1", id: { in: ["s1"] } } });
    db.segment.findMany.mockResolvedValue([]);
    expect(await wc({ campo: "segmento", op: "qualquer", valores: ["s-outro"] })).toEqual(NADA);
  });

  it("busca de texto: nome, e-mail, telefone e também só os dígitos", async () => {
    const w = await whereDeContatos(ctx, { busca: "(11) 99999-8888" });
    expect(JSON.stringify(w.where)).toContain('"contains":"11999998888"');
    expect(JSON.stringify(w.where)).toContain('"name":{"contains":"(11) 99999-8888","mode":"insensitive"}');
  });

  it("não consulta definições nem segmentos quando o filtro não usa", async () => {
    await whereDeContatos(ctx, um({ campo: "nome", op: "contem", valor: "a" }));
    expect(db.customField.findMany).not.toHaveBeenCalled();
    expect(db.segment.findMany).not.toHaveBeenCalled();
  });
});

describe("negócios: cada campo × operador vira o where esperado", () => {
  it.each<[string, FiltroDeConsulta, unknown]>([
    ["funil", { campo: "funil", op: "qualquer", valores: ["p1"] }, { pipelineId: { in: ["p1"] } }],
    ["etapa não é", { campo: "etapa", op: "nenhum", valores: ["s1"] }, { stageId: { notIn: ["s1"] } }],
    ["tipo da etapa", { campo: "tipoEtapa", op: "qualquer", valores: ["won"] }, { stage: { type: { in: ["won"] } } }],
    ["sem responsável", { campo: "responsavel", op: "vazio" }, { ownerId: null }],
    ["com empresa", { campo: "empresa", op: "preenchido" }, { companyId: { not: null } }],
    ["contato", { campo: "contato", op: "qualquer", valores: ["k1"] }, { contacts: { some: { contactId: { in: ["k1"] } } } }],
    ["sem contato", { campo: "contato", op: "vazio" }, { contacts: { none: {} } }],
    ["etiqueta do contato", { campo: "etiqueta", op: "qualquer", valores: ["t1"] }, { contacts: { some: { contact: { tags: { some: { tagId: { in: ["t1"] } } } } } } }],
    ["produto", { campo: "produto", op: "qualquer", valores: ["pr1"] }, { items: { some: { productId: { in: ["pr1"] } } } }],
    ["sem produto", { campo: "produto", op: "vazio" }, { items: { none: {} } }],
    ["produto nenhum de", { campo: "produto", op: "nenhum", valores: ["pr1"] }, { items: { none: { productId: { in: ["pr1"] } } } }],
    ["valor > 100 (exato em centavos)", { campo: "valor", op: "gt", valor: "100" }, { amountCents: { gte: 10001 } }],
    ["valor ≥ 100,50", { campo: "valor", op: "gte", valor: "100,50" }, { amountCents: { gte: 10050 } }],
    ["valor < 100", { campo: "valor", op: "lt", valor: "100" }, { amountCents: { lte: 9999 } }],
    ["valor ≤ 100", { campo: "valor", op: "lte", valor: "100" }, { amountCents: { lte: 10000 } }],
    ["valor = 10,10 (sem ruído de ponto flutuante)", { campo: "valor", op: "eq", valor: "10,10" }, { amountCents: 1010 }],
    ["valor ≠ 5", { campo: "valor", op: "neq", valor: "5" }, { NOT: { amountCents: 500 } }],
    ["valor entre", { campo: "valor", op: "entre", valor: "1.000", ate: "5.000,50" }, { amountCents: { gte: 100000, lte: 500050 } }],
    ["probabilidade ≥ 50", { campo: "probabilidade", op: "gte", valor: "50" }, { probability: { gte: 50 } }],
    ["criado no dia (SP)", { campo: "criadoEm", op: "em", valor: "2026-10-19" }, { createdAt: { gte: new Date("2026-10-19T03:00:00Z"), lt: new Date("2026-10-20T03:00:00Z") } }],
    ["não fechado", { campo: "fechadoEm", op: "vazio" }, { closedAt: null }],
    ["fechado depois de", { campo: "fechadoEm", op: "depois", valor: "2026-10-01" }, { closedAt: { gte: new Date("2026-10-02T03:00:00Z") } }],
    [
      "previsão nos próximos 30 dias",
      { campo: "previsao", op: "proximos", valor: "30" },
      { expectedClosingAt: { gte: new Date("2026-10-19T03:00:00Z"), lt: new Date("2026-11-18T03:00:00Z") } },
    ],
    ["motivo de perda contém", { campo: "motivoPerda", op: "contem", valor: "preço" }, { lostReason: { contains: "preço", mode: "insensitive" } }],
    ["nome é", { campo: "nome", op: "eq", valor: "Plano" }, { name: { equals: "Plano", mode: "insensitive" } }],
    ["dias na etapa ≥ 7", { campo: "diasNaEtapa", op: "gte", valor: "7" }, { stageSince: { lte: new Date(agora.getTime() - 7 * DIA) } }],
    ["dias na etapa < 3", { campo: "diasNaEtapa", op: "lt", valor: "3" }, { stageSince: { gt: new Date(agora.getTime() - 3 * DIA) } }],
    [
      "dias na etapa = 2",
      { campo: "diasNaEtapa", op: "eq", valor: "2" },
      { AND: [{ stageSince: { lte: new Date(agora.getTime() - 2 * DIA) } }, { stageSince: { gt: new Date(agora.getTime() - 3 * DIA) } }] },
    ],
  ])("%s", async (_, c, esperado) => {
    expect(await wn(c)).toEqual(esperado);
  });

  it("equipe (negócio)", async () => {
    expect(await wn({ campo: "equipe", op: "qualquer", valores: ["t1"] })).toEqual({
      owner: { is: { teamMemberships: { some: { team: { orgId: "o1" }, teamId: { in: ["t1"] } } } } },
    });
  });

  it("tarefa atrasada e de hoje no fuso de São Paulo", async () => {
    // Fim do "hoje" em SP (19/10) = 20/10 00:00 SP = 20/10 03:00 UTC, mesmo com o relógio UTC já no dia 20.
    const amanhaSP = new Date("2026-10-20T03:00:00Z");
    expect(await wn({ campo: "tarefa", op: "qualquer", valores: ["atrasada"] })).toEqual({
      tasks: { some: { doneAt: null, dueAt: { lt: agora } } },
    });
    expect(await wn({ campo: "tarefa", op: "qualquer", valores: ["hoje"] })).toEqual({
      tasks: { some: { doneAt: null, dueAt: { gte: agora, lt: amanhaSP } } },
    });
    expect(await wn({ campo: "tarefa", op: "qualquer", valores: ["semTarefa"] })).toEqual({ tasks: { none: { doneAt: null } } });
    expect(await wn({ campo: "tarefa", op: "qualquer", valores: ["atrasada", "hoje"] })).toEqual({
      OR: [{ tasks: { some: { doneAt: null, dueAt: { lt: agora } } } }, { tasks: { some: { doneAt: null, dueAt: { gte: agora, lt: amanhaSP } } } }],
    });
    expect(await wn({ campo: "tarefa", op: "nenhum", valores: ["comTarefa"] })).toEqual({ NOT: { tasks: { some: { doneAt: null } } } });
  });

  it("busca por nome do negócio, empresa ou contato", async () => {
    const w = await whereDeNegocios(ctx, { busca: "acme" });
    const s = JSON.stringify(w.where);
    expect(s).toContain('"name":{"contains":"acme","mode":"insensitive"}');
    expect(s).toContain('"company":{"is":{"name"');
    expect(s).toContain('"contacts":{"some":{"contact"');
  });

  it("arquivados só quando pedido", async () => {
    const w = await whereDeNegocios(ctx, "", { incluirArquivados: true });
    expect(w.where).toEqual({ orgId: "o1" });
  });
});

describe("árvore E/OU, contrato e escopo", () => {
  it("E/OU aninhado", async () => {
    const w = await whereDeNegocios(
      ctx,
      {
        logica: "ou",
        grupos: [
          { logica: "e", condicoes: [{ campo: "funil", op: "qualquer", valores: ["p1"] }, { campo: "valor", op: "gte", valor: "10" }] },
          { logica: "ou", condicoes: [{ campo: "responsavel", op: "vazio" }, { campo: "empresa", op: "vazio" }] },
        ],
      },
      { agora }
    );
    expect(w.emMemoria).toBe(false);
    expect(w.where).toEqual({
      orgId: "o1",
      AND: [
        { archivedAt: null },
        {
          OR: [
            { AND: [{ pipelineId: { in: ["p1"] } }, { amountCents: { gte: 1000 } }] },
            { OR: [{ ownerId: null }, { companyId: null }] },
          ],
        },
      ],
    });
  });

  it("filtros rápidos entram em E no banco, junto do OU dos avançados", async () => {
    const w = await whereDeContatos(
      ctx,
      {
        logica: "ou",
        grupos: [
          { logica: "e", condicoes: [{ campo: "email", op: "vazio" }] },
          { logica: "e", condicoes: [{ campo: "telefone", op: "vazio" }] },
        ],
        rapidos: [{ campo: "empresa", op: "qualquer", valores: ["e1"] }],
      },
      { agora }
    );
    expect(w.avisos).toEqual([]);
    expect(w.where).toEqual({
      orgId: "o1",
      AND: [{ companyId: { in: ["e1"] } }, { OR: [{ email: "" }, { phone: "" }] }],
    });
  });

  it("contrato sempre presente, mesmo sem filtro", async () => {
    expect((await whereDeContatos(ctx, undefined)).where).toEqual({ orgId: "o1" });
    expect((await whereDeNegocios(ctx, "")).where).toEqual({ orgId: "o1", AND: [{ archivedAt: null }] });
  });

  it("escopo 'só os meus' entra no AND e o filtro não o substitui", async () => {
    const meu = { ...ctx, escopo: { contatos: "proprios" as const, negocios: "todos" as const, conversas: "todos" as const } };
    const w = await whereDeContatos(meu, um({ campo: "responsavel", op: "qualquer", valores: ["u9"] }));
    expect(w.where).toEqual({ orgId: "o1", AND: [{ ownerId: { in: ["u1"] } }, { ownerId: { in: ["u9"] } }] });
  });

  it("escopo de equipe consulta os colegas só deste contrato", async () => {
    const eq = { ...ctx, escopo: { contatos: "todos" as const, negocios: "equipe" as const, conversas: "todos" as const } };
    const w = await whereDeNegocios(eq, "");
    expect(w.where).toEqual({ orgId: "o1", AND: [{ ownerId: { in: ["u1", "u2"] } }, { archivedAt: null }] });
    expect(db.teamMember.findMany.mock.calls[0][0].where.team.orgId).toBe("o1");
  });

  it("campo e operador desconhecidos são descartados com aviso", async () => {
    const w = await whereDeContatos(ctx, {
      logica: "e",
      grupos: [
        {
          logica: "e",
          condicoes: [
            { campo: "senha", op: "eq", valor: "x" },
            { campo: "nome", op: "sql", valor: "1" },
            { campo: "criadoEm", op: "contem", valor: "x" },
            { campo: "funil", op: "qualquer", valores: ["p1"] }, // é de negócio, não de contato
            { campo: "nome", op: "contem" }, // rascunho sem valor
            { campo: "nome", op: "contem", valor: "ok" },
          ],
        },
      ],
    });
    expect(w.avisos).toHaveLength(5);
    expect(w.avisos[0]).toContain("senha");
    expect(w.avisos.join(" ")).toContain("campo desconhecido");
    expect(w.where).toEqual({ orgId: "o1", AND: [{ name: { contains: "ok", mode: "insensitive" } }] });
  });

  it("filtro em JSON inválido vira aviso, não erro", async () => {
    const w = await whereDeContatos(ctx, "{nao é json");
    expect(w.avisos[0]).toContain("JSON");
    expect(w.where).toEqual({ orgId: "o1" });
  });
});

describe("campos personalizados", () => {
  const defs = [
    { id: "f1", entity: "contact", pipelineId: null, key: "plano", label: "Plano", type: "select", options: [{ value: "a", label: "A" }], required: false, helpText: "", showOnCard: false, position: 0 },
    { id: "f2", entity: "contact", pipelineId: null, key: "consumo", label: "Consumo", type: "number", options: [], required: false, helpText: "", showOnCard: false, position: 1 },
    { id: "f3", entity: "contact", pipelineId: null, key: "obs", label: "Obs", type: "text", options: [], required: false, helpText: "", showOnCard: false, position: 2 },
    { id: "f4", entity: "contact", pipelineId: null, key: "vip", label: "VIP", type: "checkbox", options: [], required: false, helpText: "", showOnCard: false, position: 3 },
    { id: "f5", entity: "contact", pipelineId: null, key: "temas", label: "Temas", type: "multiselect", options: [], required: false, helpText: "", showOnCard: false, position: 4 },
  ];
  beforeEach(() => db.customField.findMany.mockResolvedValue(defs));
  const ausente = (k: string) => ({ customFields: { path: [k], equals: Prisma.AnyNull } });

  it("lista, texto, sim/não e várias opções viram where no JSON", async () => {
    expect(await wc({ campo: "cf:plano", op: "qualquer", valores: ["a"] })).toEqual({ OR: [{ customFields: { path: ["plano"], equals: "a" } }] });
    expect(await wc({ campo: "cf:plano", op: "nenhum", valores: ["a"] })).toEqual({
      OR: [{ NOT: { OR: [{ customFields: { path: ["plano"], equals: "a" } }] } }, ausente("plano")],
    });
    expect(await wc({ campo: "cf:obs", op: "contem", valor: "Urg" })).toEqual({ customFields: { path: ["obs"], string_contains: "Urg", mode: "insensitive" } });
    expect(await wc({ campo: "cf:vip", op: "eq", valor: "true" })).toEqual({
      OR: [{ customFields: { path: ["vip"], equals: true } }, { customFields: { path: ["vip"], equals: "true" } }],
    });
    expect(await wc({ campo: "cf:temas", op: "todos", valores: ["x", "y"] })).toEqual({ customFields: { path: ["temas"], array_contains: ["x", "y"] } });
    expect(db.customField.findMany).toHaveBeenCalledWith({ where: { orgId: "o1", entity: "contact" } });
  });

  it("número fica em memória; campo inexistente é descartado com aviso", async () => {
    const w = await whereDeContatos(ctx, {
      logica: "e",
      grupos: [{ logica: "e", condicoes: [{ campo: "cf:consumo", op: "gt", valor: "100" }, { campo: "cf:sumiu", op: "eq", valor: "x" }] }],
    });
    expect(w.emMemoria).toBe(true);
    expect(w.avisos).toEqual(["Condição “cf:sumiu” ignorada: campo personalizado não existe."]);
    // A pré-seleção não restringe pelo campo em memória.
    expect(w.where).toEqual({ orgId: "o1" });
  });

  it("resolverConjunto avalia em memória e devolve where exato por id", async () => {
    db.contact.findMany.mockResolvedValueOnce([
      { id: "c1", customFields: { consumo: 150 } },
      { id: "c2", customFields: { consumo: 50 } },
      { id: "c3", customFields: {} },
    ]);
    const w = await whereDeContatos(ctx, um({ campo: "cf:consumo", op: "gt", valor: "100" }));
    const r = await resolverConjunto(w, { orderBy: [{ name: "asc" }] });
    expect(r).toEqual({ where: { orgId: "o1", id: { in: ["c1"] } }, ids: ["c1"], truncado: false });
    expect(db.contact.findMany.mock.calls[0][0]).toMatchObject({ where: { orgId: "o1" }, orderBy: [{ name: "asc" }], take: 5001 });
  });

  it("OU entre condição do banco e de memória: confere a do banco por id (exato)", async () => {
    db.contact.findMany
      .mockResolvedValueOnce([
        { id: "c1", customFields: { consumo: 150 } }, // passa pela memória
        { id: "c2", customFields: { consumo: 10 } }, // passa pelo banco (nome)
        { id: "c3", customFields: { consumo: 10 } }, // não passa
      ])
      .mockResolvedValueOnce([{ id: "c2" }]);
    const w = await whereDeContatos(ctx, {
      logica: "e",
      grupos: [{ logica: "ou", condicoes: [{ campo: "cf:consumo", op: "gt", valor: "100" }, { campo: "nome", op: "contem", valor: "bia" }] }],
    });
    const r = await resolverConjunto(w);
    expect(r.ids).toEqual(["c1", "c2"]);
    expect(db.contact.findMany.mock.calls[1][0]).toEqual({
      where: { AND: [{ orgId: "o1" }, { name: { contains: "bia", mode: "insensitive" } }, { id: { in: ["c1", "c2", "c3"] } }] },
      select: { id: true },
    });
  });

  it("passou do limite: truncado", async () => {
    db.contact.findMany.mockResolvedValueOnce([
      { id: "c1", customFields: { consumo: 150 } },
      { id: "c2", customFields: { consumo: 150 } },
      { id: "c3", customFields: { consumo: 150 } },
    ]);
    const w = await whereDeContatos(ctx, um({ campo: "cf:consumo", op: "gt", valor: "100" }));
    const r = await resolverConjunto(w, { limite: 2 });
    expect(r.truncado).toBe(true);
    expect(r.ids).toEqual(["c1", "c2"]);
  });
});

describe("idsDoFiltro (para as ações em lote)", () => {
  it("sem memória: ids pelo where, com corte e aviso de truncado", async () => {
    db.deal.findMany.mockResolvedValueOnce([{ id: "d1" }, { id: "d2" }, { id: "d3" }]);
    const r = await idsDoFiltro(ctx, "negocios", um({ campo: "responsavel", op: "vazio" }), 2);
    expect(r).toEqual({ ids: ["d1", "d2"], truncado: true, avisos: [] });
    expect(db.deal.findMany.mock.calls[0][0]).toEqual({
      where: { orgId: "o1", AND: [{ archivedAt: null }, { ownerId: null }] },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 3,
    });
  });
});

describe("orderByDe", () => {
  it("mapeia a coluna e desempata por id", () => {
    expect(orderByDe("contatos", { campo: "empresa", direcao: "asc" })).toEqual([{ company: { name: "asc" } }, { id: "asc" }]);
    expect(orderByDe("negocios", { campo: "previsao", direcao: "desc" })).toEqual([{ expectedClosingAt: { sort: "desc", nulls: "last" } }, { id: "asc" }]);
    // Mais dias na etapa = entrou antes.
    expect(orderByDe("negocios", { campo: "diasNaEtapa", direcao: "desc" })).toEqual([{ stageSince: "asc" }, { id: "asc" }]);
    expect(orderByDe("negocios", { campo: "etapa", direcao: "asc" })).toEqual([{ stage: { position: "asc" } }, { id: "asc" }]);
  });
});
