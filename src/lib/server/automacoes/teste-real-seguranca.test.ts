import { describe, it, expect, vi, beforeEach } from "vitest";
import { exemploProposta } from "@/lib/automacoes/exemplo.test-helpers";

// Segurança do "Testar de verdade": nada fica solto no banco, o teste não roda
// como simulado por corrida, não manda para um cliente sem confirmar, e
// "Apagar dados do teste" leva tudo o que o teste criou.

const db = vi.hoisted(() => ({
  automacao: { findFirst: vi.fn() },
  automacaoVersao: { upsert: vi.fn() },
  automacaoExecucao: { findFirst: vi.fn(), update: vi.fn() },
  automacaoPasso: { deleteMany: vi.fn() },
  contact: { findMany: vi.fn(), deleteMany: vi.fn() },
  dealContact: { findMany: vi.fn() },
  task: { findMany: vi.fn(), deleteMany: vi.fn() },
  aviso: { deleteMany: vi.fn() },
  emailEnvio: { deleteMany: vi.fn() },
  note: { deleteMany: vi.fn() },
  deal: { deleteMany: vi.fn() },
  conversation: { deleteMany: vi.fn() },
  company: { deleteMany: vi.fn() },
  contactTag: { findFirst: vi.fn() },
  tag: { deleteMany: vi.fn() },
}));
const insc = vi.hoisted(() => ({ inscrever: vi.fn() }));
const exe = vi.hoisted(() => ({ executarExecucao: vi.fn(async () => ({ status: "concluida" })) }));
const criar = vi.hoisted(() => ({ criarRegistroDeTeste: vi.fn(), conferirCondicoes: vi.fn(async () => ({ cumpridas: [], naoCumpridas: [] })) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./inscricao", () => insc);
vi.mock("./executor", () => exe);
vi.mock("./contexto", () => ({ montarContexto: vi.fn() }));
vi.mock("@/lib/server/eventos/barramento", () => ({ comAtor: (_a: unknown, f: () => unknown) => f() }));
vi.mock("./teste-real", async (original) => {
  const real = await original<typeof import("./teste-real")>();
  return { ...real, criarRegistroDeTeste: criar.criarRegistroDeTeste, conferirCondicoes: criar.conferirCondicoes };
});

import { apagarTeste, contatoComOsDadosDoTeste, testarDeVerdade } from "./gerenciar";
import { apagarCriadosNoTeste } from "./teste-real";

const zero = { count: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  db.automacao.findFirst.mockResolvedValue({ id: "a1", orgId: "o1", objeto: "deal", rascunho: exemploProposta(), versaoPublicadaId: "v1" });
  db.automacaoVersao.upsert.mockResolvedValue({ id: "v0" });
  db.contact.findMany.mockResolvedValue([]);
  db.dealContact.findMany.mockResolvedValue([]);
  db.task.findMany.mockResolvedValue([]);
  for (const m of [db.contact.deleteMany, db.task.deleteMany, db.aviso.deleteMany, db.emailEnvio.deleteMany, db.note.deleteMany, db.deal.deleteMany, db.conversation.deleteMany, db.company.deleteMany, db.tag.deleteMany, db.automacaoPasso.deleteMany]) {
    m.mockResolvedValue(zero);
  }
  db.contactTag.findFirst.mockResolvedValue(null);
  // O registro de teste vai sendo anotado em `criados` enquanto é criado.
  criar.criarRegistroDeTeste.mockImplementation(async (_o, _a, _d, _c, criados: { objeto: string; id: string }[]) => {
    criados.push({ objeto: "contact", id: "c-teste" }, { objeto: "deal", id: "d-teste" });
    return { objetoId: "d-teste", gatilho: { teste: true }, criados };
  });
});

describe("testar de verdade", () => {
  it("as variáveis do teste vão na mesma escrita que cria a execução (a varredura não roda como simulado)", async () => {
    insc.inscrever.mockResolvedValue({ inscrita: true, execucaoId: "x1" });
    await testarDeVerdade("o1", "a1", { telefone: "47 99999-0000" }, "u1");
    expect(insc.inscrever.mock.calls[0][2]).toMatchObject({
      teste: true,
      variaveis: { passos: {}, __testeReal: { telefone: "5547999990000", criados: [{ objeto: "contact", id: "c-teste" }, { objeto: "deal", id: "d-teste" }] } },
    });
    expect(db.automacaoExecucao.update).not.toHaveBeenCalled();
  });

  it("inscrição recusada ou erro no meio: apaga o que já tinha sido criado", async () => {
    insc.inscrever.mockResolvedValue({ inscrita: false, motivo: "x" });
    await expect(testarDeVerdade("o1", "a1", { telefone: "47 99999-0000" }, "u1")).rejects.toMatchObject({ status: 409 });
    expect(db.contact.deleteMany.mock.calls[0][0].where).toEqual({ orgId: "o1", id: { in: ["c-teste"] } });
    expect(db.deal.deleteMany.mock.calls[0][0].where).toEqual({ orgId: "o1", id: { in: ["d-teste"] } });

    vi.clearAllMocks();
    db.contact.deleteMany.mockResolvedValue(zero);
    insc.inscrever.mockRejectedValue(new Error("caiu"));
    await expect(testarDeVerdade("o1", "a1", { telefone: "47 99999-0000" }, "u1")).rejects.toThrow("caiu");
    expect(db.contact.deleteMany).toHaveBeenCalled();
  });

  it("número de um contato do CRM: não manda sem confirmar", async () => {
    db.contact.findMany.mockResolvedValue([{ name: "Ana Cliente", phone: "(47) 99999-0000", email: "" }]);
    await expect(testarDeVerdade("o1", "a1", { telefone: "47 99999-0000" }, "u1")).rejects.toMatchObject({ status: 409, codigo: "contato_existente" });
    expect(criar.criarRegistroDeTeste).not.toHaveBeenCalled();

    insc.inscrever.mockResolvedValue({ inscrita: true, execucaoId: "x1" });
    await testarDeVerdade("o1", "a1", { telefone: "47 99999-0000", confirmarContatoExistente: true }, "u1");
    expect(criar.criarRegistroDeTeste).toHaveBeenCalled();
  });
});

describe("contato com os dados do teste", () => {
  it("acha pelo telefone (com ou sem DDI) e pelo e-mail; ignora os contatos de teste", async () => {
    db.contact.findMany.mockResolvedValue([{ name: "Bia", phone: "47999990000", email: "" }]);
    expect(await contatoComOsDadosDoTeste("o1", "5547999990000", "")).toBe("Bia");
    expect(db.contact.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "o1", source: { not: "teste" } });

    db.contact.findMany.mockResolvedValue([{ name: "Caio", phone: "", email: "Caio@X.com" }]);
    expect(await contatoComOsDadosDoTeste("o1", null, "caio@x.com")).toBe("Caio");

    db.contact.findMany.mockResolvedValue([{ name: "Outro", phone: "11988887777", email: "" }]);
    expect(await contatoComOsDadosDoTeste("o1", "5547999990000", "")).toBeNull();
    expect(await contatoComOsDadosDoTeste("o1", null, "")).toBeNull();
  });
});

describe("apagar dados do teste", () => {
  it("leva avisos, e-mails, a conversa do telefone criada no teste e a etiqueta sem uso", async () => {
    const desde = new Date("2026-10-23T10:00:00Z");
    db.dealContact.findMany.mockResolvedValue([{ dealId: "d-passo" }]);
    db.task.findMany.mockResolvedValue([{ id: "t1" }]);
    await apagarCriadosNoTeste("o1", { criados: [{ objeto: "contact", id: "c1" }, { objeto: "tag", id: "tg" }], telefone: "5547999990000", desde });
    expect(db.aviso.deleteMany.mock.calls[0][0].where).toEqual({ orgId: "o1", objetoId: { in: ["c1", "d-passo", "t1"] } });
    expect(db.emailEnvio.deleteMany.mock.calls[0][0].where).toEqual({ orgId: "o1", contactId: { in: ["c1"] } });
    // Só a conversa que nasceu durante o teste: a que já existia é da pessoa.
    expect(db.conversation.deleteMany.mock.calls[1][0].where).toEqual({
      contactId: "5547999990000",
      channel: { in: ["whatsapp_qr", "whatsapp_meta"] },
      agent: { orgId: "o1" },
      createdAt: { gte: desde },
    });
    expect(db.tag.deleteMany.mock.calls[0][0].where).toEqual({ orgId: "o1", id: "tg" });
  });

  it("etiqueta ainda em uso fica", async () => {
    db.contactTag.findFirst.mockResolvedValue({ tagId: "tg" });
    await apagarCriadosNoTeste("o1", { criados: [{ objeto: "tag", id: "tg" }], desde: new Date() });
    expect(db.tag.deleteMany).not.toHaveBeenCalled();
  });

  it("apaga o histórico com telefone e e-mail; com um passo rodando, espera ou recusa", async () => {
    vi.useFakeTimers();
    try {
      db.automacaoExecucao.findFirst
        .mockResolvedValueOnce({ id: "x1", status: "rodando" })
        .mockResolvedValueOnce({ id: "x1", status: "concluida" })
        .mockResolvedValueOnce({ variaveis: { __testeReal: { telefone: "5547999990000", email: "a@b.c", criados: [], cumpridas: [], naoCumpridas: [] } }, createdAt: new Date(), passos: [] });
      const p = apagarTeste("o1", "a1", "x1");
      await vi.advanceTimersByTimeAsync(1000);
      await p;
      expect(db.automacaoPasso.deleteMany).toHaveBeenCalledWith({ where: { execucaoId: "x1" } });
      const gravado = db.automacaoExecucao.update.mock.calls.at(-1)![0].data.variaveis.__testeReal;
      expect(gravado).toMatchObject({ telefone: "", email: "", apagado: true });

      db.automacaoExecucao.findFirst.mockReset();
      db.automacaoExecucao.findFirst.mockResolvedValue({ id: "x1", status: "rodando" });
      const q = apagarTeste("o1", "a1", "x1").catch((e) => e);
      await vi.advanceTimersByTimeAsync(11_000);
      expect(await q).toMatchObject({ status: 409 });
    } finally {
      vi.useRealTimers();
    }
  });
});
