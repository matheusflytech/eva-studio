import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  emailDominio: { findUnique: vi.fn() },
  emailSupressao: { findUnique: vi.fn(), upsert: vi.fn() },
  emailModelo: { findFirst: vi.fn() },
  emailEnvio: { create: vi.fn(), update: vi.fn() },
  contact: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
}));
const resend = vi.hoisted(() => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./resend", () => resend);

import { enviarEmailDoContrato, remetenteDe, suprimirEmail } from "./envio";
import { montarEmail } from "@/lib/email/montar";
import { criarTokenDeDescadastro, lerTokenDeDescadastro } from "./descadastro";
import { bounceDefinitivo, proximaSituacao, situacaoDoEvento } from "./eventos";

const ENV = { ...process.env };
const dominio = { orgId: "o1", dominio: "loja.com", status: "verified", remetenteNome: "Loja Aurora", remetenteLocal: "oi", responderPara: "vendas@loja.com" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_SECRET = "segredo";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.eva";
  db.emailDominio.findUnique.mockResolvedValue(dominio);
  db.emailSupressao.findUnique.mockResolvedValue(null);
  db.organization.findUnique.mockResolvedValue({ name: "Aurora Ltda" });
  db.contact.findFirst.mockResolvedValue({ name: "Ana Souza", email: "Ana@X.com", phone: "", jobTitle: "", customFields: { cidade: "Goiânia" }, company: { name: "Clínica" } });
  db.emailEnvio.create.mockResolvedValue({ id: "env1" });
  resend.enviarEmail.mockResolvedValue({ ok: true, id: "em_1" });
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("remetente e montagem", () => {
  it("remetente com nome do domínio (ou do contrato) e o endereço local", () => {
    expect(remetenteDe(dominio, "Aurora Ltda")).toBe("Loja Aurora <oi@loja.com>");
    expect(remetenteDe({ ...dominio, remetenteNome: "", remetenteLocal: "" }, 'A "B" <C>')).toBe("A B C <contato@loja.com>");
  });

  it("modo HTML escapa os valores; os dois modos levam rodapé e texto com o descadastro", () => {
    const r = montarEmail({ assunto: "Oi {{contato.primeiro_nome}}", corpo: "<p>{{contato.nome}}</p>", modo: "html" }, { contato: { nome: "<Ana>" } }, { remetente: "Loja", linkDeDescadastro: "https://x/d" });
    expect(r.assunto).toBe("Oi <Ana>");
    expect(r.html).toContain("<p>&lt;Ana&gt;</p>");
    expect(r.texto).toContain("Para não receber mais: https://x/d");
  });
});

describe("enviarEmailDoContrato", () => {
  it("envia como o contrato, com List-Unsubscribe em um clique, e registra o envio com o id da Resend", async () => {
    const r = await enviarEmailDoContrato("o1", {
      contactId: "c1",
      conteudo: { assunto: "Oi {{contato.primeiro_nome}}", corpo: "Olá de {{campo.cidade}}", modo: "simples" },
      origem: "teste",
    });
    expect(r).toEqual({ ok: true, envioId: "env1" });
    const e = resend.enviarEmail.mock.calls[0][0];
    expect(e).toMatchObject({ from: "Loja Aurora <oi@loja.com>", to: "ana@x.com", subject: "Oi Ana", replyTo: "vendas@loja.com", tags: { envio: "env1", origem: "teste" } });
    expect(e.html).toContain("Olá de Goiânia");
    expect(e.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(e.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/app\.eva\/api\/email\/descadastro\?t=/);
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: "c1", orgId: "o1" });
    expect(db.emailEnvio.update).toHaveBeenLastCalledWith({ where: { id: "env1" }, data: { status: "enviado", resendId: "em_1" } });
  });

  it("sem domínio verificado: não envia", async () => {
    db.emailDominio.findUnique.mockResolvedValue({ ...dominio, status: "pending" });
    expect(await enviarEmailDoContrato("o1", { email: "a@b.com", conteudo: { assunto: "a", corpo: "b", modo: "simples" }, origem: "teste" })).toMatchObject({ ok: false, motivo: "sem_dominio" });
    expect(resend.enviarEmail).not.toHaveBeenCalled();
  });

  it("endereço na supressão do contrato: não envia", async () => {
    db.emailSupressao.findUnique.mockResolvedValue({ motivo: "descadastro" });
    expect(await enviarEmailDoContrato("o1", { email: "a@b.com", conteudo: { assunto: "a", corpo: "b", modo: "simples" }, origem: "teste" })).toMatchObject({ ok: false, motivo: "suprimido" });
    expect(db.emailEnvio.create).not.toHaveBeenCalled();
  });

  it("variável vazia sem padrão: bloqueia e diz qual", async () => {
    const r = await enviarEmailDoContrato("o1", { contactId: "c1", conteudo: { assunto: "Oi", corpo: "{{campo.plano}}", modo: "simples" }, origem: "teste" });
    expect(r).toMatchObject({ ok: false, motivo: "faltou_variavel" });
    expect(r.ok ? "" : r.erro).toContain("campo.plano");
  });

  it("sem tabela de e-mail: motivo claro", async () => {
    db.emailDominio.findUnique.mockRejectedValue(new Error("relation does not exist"));
    expect(await enviarEmailDoContrato("o1", { email: "a@b.com", conteudo: { assunto: "a", corpo: "b", modo: "simples" }, origem: "teste" })).toMatchObject({ ok: false, motivo: "sem_tabela" });
  });

  it("modelo de outro contrato: não acha", async () => {
    db.emailModelo.findFirst.mockResolvedValue(null);
    expect(await enviarEmailDoContrato("o1", { email: "a@b.com", conteudo: { modeloId: "m9" }, origem: "teste" })).toMatchObject({ ok: false, motivo: "sem_modelo" });
    expect(db.emailModelo.findFirst.mock.calls[0][0].where).toEqual({ id: "m9", orgId: "o1" });
  });

  it("erro da Resend: envio fica como falhou", async () => {
    resend.enviarEmail.mockResolvedValue({ ok: false, erro: "domain not verified" });
    await enviarEmailDoContrato("o1", { email: "a@b.com", conteudo: { assunto: "a", corpo: "b", modo: "simples" }, origem: "teste" });
    expect(db.emailEnvio.update).toHaveBeenLastCalledWith({ where: { id: "env1" }, data: { status: "falhou", erro: "domain not verified" } });
  });

  it("suprimir guarda o e-mail em minúsculas, sem sobrescrever o motivo original", async () => {
    await suprimirEmail("o1", " Ana@X.com ", "bounce", "x");
    expect(db.emailSupressao.upsert).toHaveBeenCalledWith({
      where: { orgId_email: { orgId: "o1", email: "ana@x.com" } },
      create: { orgId: "o1", email: "ana@x.com", motivo: "bounce", detalhe: "x" },
      update: {},
    });
  });
});

describe("link de descadastro", () => {
  it("ida e volta; e-mail trocado ou assinatura mexida não vale", () => {
    const t = criarTokenDeDescadastro("o1", "Ana@X.com");
    expect(lerTokenDeDescadastro(t)).toEqual({ orgId: "o1", email: "ana@x.com" });
    const [carga, ass] = t.split(".");
    const outra = Buffer.from("o1\nbeto@x.com").toString("base64url");
    expect(lerTokenDeDescadastro(`${outra}.${ass}`)).toBeNull();
    expect(lerTokenDeDescadastro(`${carga}.${ass}x`)).toBeNull();
    expect(lerTokenDeDescadastro("")).toBeNull();
  });
});

describe("eventos da Resend", () => {
  it("situação só avança; bounce e reclamação mandam", () => {
    expect(situacaoDoEvento("email.delivered")).toBe("entregue");
    expect(situacaoDoEvento("email.qualquer")).toBeNull();
    expect(proximaSituacao("aberto", "entregue")).toBeNull();
    expect(proximaSituacao("entregue", "clicado")).toBe("clicado");
    expect(proximaSituacao("clicado", "reclamacao")).toBe("reclamacao");
    expect(proximaSituacao("bounce", "entregue")).toBeNull();
  });

  it("só bounce permanente tira da lista", () => {
    expect(bounceDefinitivo({ bounce: { type: "Permanent" } })).toBe(true);
    expect(bounceDefinitivo({ bounce: { type: "Transient" } })).toBe(false);
  });
});
