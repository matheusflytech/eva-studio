import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contactTag: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  contact: { findUnique: vi.fn(async () => ({ orgId: "o1" })), update: vi.fn() },
  sequenceEnrollment: { updateMany: vi.fn() },
}));
const barramento = vi.hoisted(() => ({ publicarEvento: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/eventos/barramento", () => barramento);
vi.mock("@/lib/server/sequences", () => ({ enrollContactByTag: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn() }));

import { applyTag, optOutContact, removeTag } from "./contacts";

const tipos = () => barramento.publicarEvento.mock.calls.map((c) => c[0].tipo);

beforeEach(() => vi.clearAllMocks());

describe("eventos do contato", () => {
  it("etiqueta nova publica contact.tag_added; repetida não", async () => {
    db.contactTag.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ contactId: "c1", tagId: "t1" });
    await applyTag("c1", "t1");
    await applyTag("c1", "t1");
    expect(tipos()).toEqual(["contact.tag_added"]);
    expect(barramento.publicarEvento.mock.calls[0][0]).toEqual({ orgId: "o1", tipo: "contact.tag_added", objeto: "contact", objetoId: "c1", dados: { tag_id: "t1" } });
  });

  it("remover só publica se tinha a etiqueta", async () => {
    db.contactTag.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await removeTag("c1", "t1");
    await removeTag("c1", "t1");
    expect(tipos()).toEqual(["contact.tag_removed"]);
  });

  it("opt-out publica contact.opted_out", async () => {
    await optOutContact("c1");
    expect(tipos()).toEqual(["contact.opted_out"]);
  });
});
