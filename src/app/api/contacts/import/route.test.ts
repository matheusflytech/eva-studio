import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  customField: { findMany: vi.fn() },
  tag: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn() },
  contactTag: { createMany: vi.fn() },
  contactChannel: { createMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { POST } from "./route";
import { detectarSeparador, parseCsv } from "./csv";

function req(body: unknown) {
  return new Request("https://eva.test/api/contacts/import", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const campoConsumo = {
  id: "f1", entity: "contact", pipelineId: null, key: "consumo_mensal_kwh", label: "Consumo mensal (kWh)",
  type: "number", options: [], required: false, helpText: "", showOnCard: false, position: 0,
};

let seq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.contact.findMany.mockResolvedValue([]);
  db.customField.findMany.mockResolvedValue([campoConsumo]);
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.contact.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `c${++seq}`, name: data.name, email: data.email, phone: data.phone, customFields: data.customFields,
  }));
});

describe("parseCsv", () => {
  it("detecta ';' do Excel pt-BR, ignorando o que está entre aspas", () => {
    expect(detectarSeparador('nome;"a,b,c";fone\n')).toBe(";");
    expect(detectarSeparador("nome,email\n")).toBe(",");
    expect(parseCsv('﻿nome;obs\r\nAna;"x; y"\r\n')).toEqual([["nome", "obs"], ["Ana", "x; y"]]);
  });
});

describe("POST /api/contacts/import", () => {
  it("JSON inválido → 400", async () => {
    expect((await POST(req("{"))).status).toBe(400);
  });

  it("CSV com ';' importa, normaliza telefone e valida campo pelo rótulo", async () => {
    const csv = "Nome;Telefone;Consumo mensal (kWh)\nAna;(11) 99999-8888;1,5\nBia;5511988887777;muito\n";
    const res = await POST(req({ csv, agentId: "a1", channel: "whatsapp_meta" }));
    const out = await res.json();
    expect(res.status).toBe(200);
    expect(out.created).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.errors[0]).toMatch(/^Linha 3: Consumo mensal \(kWh\)/);
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Ana", phone: "5511999998888", customFields: { consumo_mensal_kwh: 1.5 } }),
      })
    );
    // Uma busca de existentes pro bloco inteiro, não uma por linha.
    expect(db.contact.findMany).toHaveBeenCalledTimes(1);
    expect(db.contactChannel.createMany).toHaveBeenCalledWith({
      data: [{ contactId: "c1", agentId: "a1", channel: "whatsapp_meta", externalId: "5511999998888" }],
      skipDuplicates: true,
    });
  });

  it("mesma pessoa repetida na planilha (formatos diferentes) vira uma ficha só", async () => {
    db.contact.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
    const csv = "nome,telefone\nAna,(11) 99999-8888\nAna S,5511999998888\n";
    const out = await (await POST(req({ csv }))).json();
    expect(out).toMatchObject({ created: 1, updated: 1, skipped: 0 });
  });

  it("telefone inválido vira erro da linha", async () => {
    const out = await (await POST(req({ csv: "nome,telefone\nAna,123\n" }))).json();
    expect(out.skipped).toBe(1);
    expect(out.errors[0]).toMatch(/telefone inválido/);
  });
});
