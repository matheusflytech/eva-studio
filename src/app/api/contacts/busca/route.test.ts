import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findMany: vi.fn(), count: vi.fn() },
  teamMember: { findMany: vi.fn(async () => []) },
  customField: { findMany: vi.fn(async () => []) },
  segment: { findMany: vi.fn(async () => []) },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { POST } from "./route";
import { GET } from "../route";

const contato = (i: number) => ({
  id: `c${String(i).padStart(3, "0")}`,
  name: `Pessoa ${i}`,
  jobTitle: "",
  email: "",
  phone: "",
  emails: [],
  phones: [],
  linkedinUrl: "",
  background: "",
  notes: "",
  customFields: {},
  source: "manual",
  optIn: true,
  ownerId: i % 2 ? "u1" : null,
  owner: i % 2 ? { id: "u1", name: "Ana" } : null,
  company: null,
  lastSeenAt: new Date("2026-10-01T00:00:00Z"),
  createdAt: new Date("2026-09-01T00:00:00Z"),
  tags: [],
  channels: [],
});

// Base falsa de 60 contatos: o mock respeita skip/take como o banco.
const BASE = Array.from({ length: 60 }, (_, i) => contato(i + 1));

const post = (corpo: unknown) =>
  POST(new Request("https://eva.test/api/contacts/busca", { method: "POST", body: JSON.stringify(corpo) }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.contact.count.mockResolvedValue(BASE.length);
  db.contact.findMany.mockImplementation(async (a: { skip?: number; take?: number }) => BASE.slice(a.skip ?? 0, (a.skip ?? 0) + (a.take ?? BASE.length)));
});

describe("POST /api/contacts/busca", () => {
  it("exige contatos:ver", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await post({})).status).toBe(403);
    expect(auth.requirePermission).toHaveBeenCalledWith("contatos:ver");
    expect(db.contact.findMany).not.toHaveBeenCalled();
  });

  it("corpo inválido → 400", async () => {
    const res = await POST(new Request("https://eva.test/api/contacts/busca", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("pageSize inválido vira 25; resposta com total, avisos e truncado", async () => {
    const r = await (await post({ pageSize: 30 })).json();
    expect(r).toMatchObject({ total: 60, page: 1, pageSize: 25, avisos: [], truncado: false });
    expect(r.contacts).toHaveLength(25);
    expect(r.contacts[0]).toMatchObject({ id: "c001", ownerId: "u1", owner: { id: "u1", name: "Ana" } });
  });

  it("contagem = soma das páginas (mesmo where na contagem e na página)", async () => {
    let soma = 0;
    const vistos = new Set<string>();
    for (let page = 1; page <= 3; page++) {
      const r = await (await post({ page, pageSize: 25 })).json();
      soma += r.contacts.length;
      for (const c of r.contacts) vistos.add(c.id);
      expect(r.total).toBe(60);
    }
    expect(soma).toBe(60);
    expect(vistos.size).toBe(60);
    const wheres = db.contact.findMany.mock.calls.map((c) => JSON.stringify(c[0].where));
    const contados = db.contact.count.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(new Set([...wheres, ...contados]).size).toBe(1);
  });

  it("página além do fim: lista vazia com o total", async () => {
    const r = await (await post({ page: 9, pageSize: 25 })).json();
    expect(r).toMatchObject({ total: 60, page: 9, contacts: [] });
    expect(db.contact.findMany.mock.calls[0][0]).toMatchObject({ skip: 200, take: 25 });
  });

  it.each([
    ["nome", { name: "asc" }],
    ["email", { email: "asc" }],
    ["telefone", { phone: "asc" }],
    ["empresa", { company: { name: "asc" } }],
    ["responsavel", { owner: { name: "asc" } }],
    ["criadoEm", { createdAt: "asc" }],
    ["ultimaAtividade", { lastSeenAt: "asc" }],
  ])("ordena por %s", async (campo, esperado) => {
    const r = await (await post({ sort: { campo, direcao: "asc" } })).json();
    expect(r.ordenacao).toEqual({ campo, direcao: "asc" });
    expect(db.contact.findMany.mock.calls[0][0].orderBy).toEqual([esperado, { id: "asc" }]);
  });

  it("ordenação recusada: ordem padrão + aviso", async () => {
    const r = await (await post({ sort: "senha" })).json();
    expect(r.avisos[0]).toContain("não é permitida");
    expect(db.contact.findMany.mock.calls[0][0].orderBy).toEqual([{ lastSeenAt: "desc" }, { id: "asc" }]);
  });

  it("filtro + atalhos + busca + escopo, tudo preso ao contrato", async () => {
    auth.requirePermission.mockResolvedValue({
      userId: "u1",
      orgId: "o1",
      role: "agent",
      escopo: { contatos: "proprios", negocios: "todos", conversas: "todos" },
    });
    await post({
      filtro: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "optIn", op: "eq", valor: "true" }] }] },
      tag: "t1",
      q: "ana",
    });
    const where = db.contact.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe("o1");
    expect(where.AND[0]).toEqual({ ownerId: { in: ["u1"] } });
    expect(where.AND).toContainEqual({ tags: { some: { tagId: { in: ["t1"] } } } });
    expect(where.AND).toContainEqual({ optIn: true });
    expect(JSON.stringify(where.AND)).toContain('"contains":"ana"');
  });
});

describe("GET /api/contacts (formato de sempre)", () => {
  it("sem pageSize continua 50 e aceita filtro na query", async () => {
    const filtro = encodeURIComponent(JSON.stringify([{ campo: "responsavel", op: "vazio" }]));
    const r = await (await GET(new Request(`https://eva.test/api/contacts?page=2&filtro=${filtro}`))).json();
    expect(r).toMatchObject({ total: 60, page: 2, pageSize: 50 });
    expect(r.contacts).toHaveLength(10);
    expect(db.contact.findMany.mock.calls[0][0]).toMatchObject({
      where: { orgId: "o1", AND: [{ ownerId: null }] },
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
      skip: 50,
      take: 50,
    });
  });

  it("pageSize e sort pela URL", async () => {
    await GET(new Request("https://eva.test/api/contacts?pageSize=100&sort=nome&dir=asc"));
    expect(db.contact.findMany.mock.calls[0][0]).toMatchObject({ take: 100, orderBy: [{ name: "asc" }, { id: "asc" }] });
  });

  it("segmento de outro contrato não devolve ninguém (antes: ignorava o segmento)", async () => {
    await GET(new Request("https://eva.test/api/contacts?segment=s9"));
    expect(db.segment.findMany).toHaveBeenCalledWith({ where: { orgId: "o1", id: { in: ["s9"] } } });
    expect(db.contact.count.mock.calls[0][0].where).toEqual({ orgId: "o1", AND: [{ id: { in: [] } }] });
  });
});
