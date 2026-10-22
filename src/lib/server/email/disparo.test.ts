import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findMany: vi.fn() },
  segment: { findFirst: vi.fn() },
  emailEnvio: { findMany: vi.fn(), create: vi.fn() },
  broadcastVariant: { update: vi.fn() },
}));
const envio = vi.hoisted(() => ({ enviarEmailDoContrato: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./envio", () => envio);
vi.mock("@/lib/server/segments", () => ({ buildSegmentWhere: vi.fn(() => ({ orgId: "o1" })), parseRules: vi.fn(() => []) }));

import { destinatariosDoDisparo, rodarDisparoDeEmail } from "./disparo";

const disparo = (extra: Record<string, unknown> = {}) => ({
  id: "b1", orgId: "o1", audience: "tags", segmentId: null, tagIds: ["t1"], manualRecipients: [], templateId: "m1", variants: [], ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.emailEnvio.findMany.mockResolvedValue([]);
  envio.enviarEmailDoContrato.mockResolvedValue({ ok: true, envioId: "e" });
});

describe("destinatariosDoDisparo", () => {
  it("por etiqueta: só com opt-in e e-mail, sem repetir endereço", async () => {
    db.contact.findMany.mockResolvedValue([
      { id: "c1", email: "Ana@X.com" },
      { id: "c2", email: "ana@x.com" },
      { id: "c3", email: "invalido" },
      { id: "c4", email: "beto@x.com" },
    ]);
    expect(await destinatariosDoDisparo(disparo())).toEqual([
      { contactId: "c1", email: "ana@x.com" },
      { contactId: "c4", email: "beto@x.com" },
    ]);
    expect(JSON.stringify(db.contact.findMany.mock.calls[0][0].where)).toContain('"optIn":true');
  });

  it("lista manual de endereços: liga ao contato quando ele existe", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", email: "ana@x.com" }]);
    expect(await destinatariosDoDisparo(disparo({ audience: "manual", manualRecipients: ["ana@x.com", "novo@y.com", "ruim"] }))).toEqual([
      { email: "ana@x.com", contactId: "c1" },
      { email: "novo@y.com", contactId: null },
    ]);
  });
});

describe("rodarDisparoDeEmail", () => {
  it("manda só quem ainda não recebeu, até o tamanho do lote, e diz quantos faltam", async () => {
    db.contact.findMany.mockResolvedValue([1, 2, 3, 4].map((i) => ({ id: `c${i}`, email: `p${i}@x.com` })));
    db.emailEnvio.findMany.mockResolvedValue([{ para: "p1@x.com" }]);
    const r = await rodarDisparoDeEmail(disparo(), { lote: 2, pausaMs: 0 });
    expect(envio.enviarEmailDoContrato.mock.calls.map((c) => c[1].email)).toEqual(["p2@x.com", "p3@x.com"]);
    expect(envio.enviarEmailDoContrato.mock.calls[0][1]).toMatchObject({ conteudo: { modeloId: "m1" }, origem: "disparo", refId: "b1" });
    expect(r).toMatchObject({ totalCount: 4, sentCount: 2, faltam: 1, parouPorContrato: false });
  });

  it("pulado (descadastrado) ganha registro para não ser tentado de novo", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", email: "ana@x.com" }]);
    envio.enviarEmailDoContrato.mockResolvedValue({ ok: false, motivo: "suprimido", erro: "não recebe mais" });
    const r = await rodarDisparoDeEmail(disparo(), { pausaMs: 0 });
    expect(r.failedCount).toBe(1);
    expect(db.emailEnvio.create.mock.calls[0][0].data).toMatchObject({ para: "ana@x.com", status: "pulado", refId: "b1", origem: "disparo" });
  });

  it("sem domínio verificado: para na hora e avisa que é do contrato", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", email: "a@x.com" }, { id: "c2", email: "b@x.com" }]);
    envio.enviarEmailDoContrato.mockResolvedValue({ ok: false, motivo: "sem_dominio", erro: "Verifique o domínio" });
    const r = await rodarDisparoDeEmail(disparo(), { pausaMs: 0 });
    expect(envio.enviarEmailDoContrato).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ parouPorContrato: true, sentCount: 0, failedCount: 0 });
    expect(db.emailEnvio.create).not.toHaveBeenCalled();
  });

  it("teste A/B: cada pessoa recebe o modelo de uma variante e o placar da variante soma", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "c1", email: "a@x.com" }]);
    await rodarDisparoDeEmail(disparo({ templateId: null, variants: [{ id: "v1", templateId: "mA", weight: 1 }] }), { pausaMs: 0 });
    expect(envio.enviarEmailDoContrato.mock.calls[0][1].conteudo).toEqual({ modeloId: "mA" });
    expect(db.broadcastVariant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { sentCount: { increment: 1 } } });
  });
});
