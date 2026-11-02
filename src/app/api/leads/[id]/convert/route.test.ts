import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const leads = vi.hoisted(() => ({ converterLeadEmNegocio: vi.fn(), resolverIdDoLead: vi.fn() }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/leads", () => leads);

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "l1" }) };
const post = () => POST(new Request("http://x/api/leads/l1/convert", { method: "POST" }), params);

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  leads.resolverIdDoLead.mockResolvedValue("c1");
});

describe("POST /api/leads/[id]/convert", () => {
  it("exige criar negócio E editar contato", async () => {
    auth.requirePermission.mockResolvedValueOnce({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await post()).status).toBe(403);
    expect(auth.requirePermission).toHaveBeenCalledWith("negocios:criar");

    auth.requirePermission.mockReset();
    auth.requirePermission.mockResolvedValueOnce({ userId: "u1", orgId: "o1", role: "owner" }).mockResolvedValueOnce({ error: "sem", status: 403 });
    expect((await post()).status).toBe(403);
    expect(auth.requirePermission).toHaveBeenLastCalledWith("contacts:manage");
    expect(leads.converterLeadEmNegocio).not.toHaveBeenCalled();
  });

  it("lead que não existe no contrato: 404", async () => {
    leads.resolverIdDoLead.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(leads.resolverIdDoLead).toHaveBeenCalledWith("o1", "l1");
  });

  it("converte e devolve o negócio criado", async () => {
    leads.converterLeadEmNegocio.mockResolvedValue({ dealId: "d1" });
    const r = await post();
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, dealId: "d1" });
    expect(leads.converterLeadEmNegocio).toHaveBeenCalledWith("o1", "c1", { userId: "u1" });
  });

  it("já tem negócio aberto: 409 com o id dele", async () => {
    leads.converterLeadEmNegocio.mockResolvedValue({ error: "Esse lead já tem um negócio aberto.", status: 409, dealId: "d9" });
    const r = await post();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "Esse lead já tem um negócio aberto.", dealId: "d9" });
  });
});
