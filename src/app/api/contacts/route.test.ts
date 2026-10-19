import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  company: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn() },
  tag: { findFirst: vi.fn() },
  segment: { findFirst: vi.fn() },
  customField: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { GET, POST } from "./route";
import { PATCH } from "./[contactId]/route";

function req(body: unknown, method = "POST") {
  return new Request("https://eva.test/api/contacts", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const criado = {
  id: "c1",
  name: "Ana",
  jobTitle: "",
  email: "",
  phone: "5511999998888",
  emails: [],
  phones: [],
  linkedinUrl: "",
  background: "",
  notes: "",
  customFields: {},
  source: "manual",
  optIn: true,
  company: null,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  tags: [],
  channels: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.contact.findFirst.mockResolvedValue(null);
  db.contact.create.mockResolvedValue(criado);
  db.company.findFirst.mockResolvedValue({ id: "emp1" });
  db.profile.findFirst.mockResolvedValue({ id: "u1" });
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.customField.findMany.mockResolvedValue([]);
});

describe("POST /api/contacts", () => {
  it("JSON inválido → 400", async () => {
    const res = await POST(req("{"));
    expect(res.status).toBe(400);
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("agente de outra org → 404 e nenhum canal criado", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    const res = await POST(req({ name: "Ana", phone: "11999998888", agentId: "a-outra", channel: "whatsapp_meta" }));
    expect(res.status).toBe(404);
    expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a-outra", orgId: "o1" } }));
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("empresa de outra org → 404", async () => {
    db.company.findFirst.mockResolvedValue(null);
    const res = await POST(req({ name: "Ana", companyId: "emp-outra" }));
    expect(res.status).toBe(404);
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("e-mail e telefone inválidos → 400", async () => {
    expect((await POST(req({ email: "nao-e-email" }))).status).toBe(400);
    expect((await POST(req({ phone: "123" }))).status).toBe(400);
  });

  it("grava telefone normalizado e cria o canal com o mesmo id", async () => {
    const res = await POST(req({ name: "Ana", phone: "(11) 99999-8888", agentId: "a1", channel: "whatsapp_meta" }));
    expect(res.status).toBe(200);
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: "5511999998888",
          channels: { create: { agentId: "a1", channel: "whatsapp_meta", externalId: "5511999998888" } },
        }),
      })
    );
  });

  it.each(["(11) 99999-8888", "5511999998888"])("telefone %s deduplica (409)", async (phone) => {
    db.contact.findFirst.mockResolvedValue({ id: "c-existente", name: "Ana" });
    const res = await POST(req({ phone }));
    expect(res.status).toBe(409);
    expect((await res.json()).existingId).toBe("c-existente");
    expect(db.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "o1", OR: [{ phone: { endsWith: "11999998888" } }] },
      })
    );
  });
});

describe("GET /api/contacts", () => {
  it("busca por telefone formatado também procura só os dígitos", async () => {
    db.contact.count.mockResolvedValue(0);
    db.contact.findMany.mockResolvedValue([]);
    await GET(new Request("https://eva.test/api/contacts?q=(11)%2099999-8888"));
    const where = db.contact.count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"contains":"11999998888"');
  });
});

describe("PATCH /api/contacts/[id]", () => {
  const params = Promise.resolve({ contactId: "c1" });

  beforeEach(() => {
    db.contact.findFirst.mockImplementation(async ({ where }: { where: { id?: string | { not: string } } }) =>
      where.id === "c1" ? { ...criado, email: "ana@x.com", optIn: true } : null
    );
  });

  it("JSON inválido → 400", async () => {
    expect((await PATCH(req("nada", "PATCH"), { params })).status).toBe(400);
  });

  it("empresa de outra org → 404 sem gravar", async () => {
    db.company.findFirst.mockResolvedValue(null);
    const res = await PATCH(req({ companyId: "emp-outra" }, "PATCH"), { params });
    expect(res.status).toBe(404);
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("e-mail de outra ficha → 409 com existingId", async () => {
    db.contact.findFirst.mockImplementation(async ({ where }: { where: { id?: string | { not: string } } }) =>
      where.id === "c1" ? { ...criado, email: "ana@x.com" } : { id: "c2", name: "Bia" }
    );
    const res = await PATCH(req({ email: "bia@x.com" }, "PATCH"), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).existingId).toBe("c2");
  });

  it("telefone inválido → 400", async () => {
    expect((await PATCH(req({ phone: "12" }, "PATCH"), { params })).status).toBe(400);
  });
});
