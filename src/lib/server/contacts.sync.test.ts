import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => {
  const d = {
    agent: { findUnique: vi.fn(async () => ({ orgId: "o1" })) },
    contactChannel: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { update: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const barramento = vi.hoisted(() => ({ publicarEvento: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/eventos/barramento", () => barramento);
vi.mock("@/lib/server/sequences", () => ({ enrollContactByTag: vi.fn() }));
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn() }));

import { syncContactFromConversation } from "./contacts";

const entrada = (variables: Record<string, unknown> = {}) => ({
  agentId: "a1", channel: "instagram", externalId: "IG1", conversationId: "c1", variables, isInbound: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.contactChannel.findUnique.mockResolvedValue(null);
  db.contact.findFirst.mockResolvedValue(null);
  db.contact.create.mockResolvedValue({ id: "novo" });
});

describe("syncContactFromConversation", () => {
  it("telefone procura pelo fim do número, não por um pedaço dele", async () => {
    await syncContactFromConversation(entrada({ telefone: "(11) 9999-9888" }));
    expect(db.contact.findFirst.mock.calls[0][0].where.OR).toEqual([{ phone: { endsWith: "1199999888" } }]);
  });

  it("outra mensagem criou o canal ao mesmo tempo: usa a ficha dela e não publica contact.created", async () => {
    db.contactChannel.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("único", { code: "P2002", clientVersion: "7" }));
    db.contactChannel.findUniqueOrThrow.mockResolvedValue({ contactId: "primeiro" });
    const id = await syncContactFromConversation(entrada({ nome: "Ana" }));
    expect(id).toBe("primeiro");
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { contactRecordId: "primeiro" } });
    expect(barramento.publicarEvento).not.toHaveBeenCalled();
  });
});
