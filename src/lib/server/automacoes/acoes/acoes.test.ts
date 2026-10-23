import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  membership: { findMany: vi.fn() },
  tag: { findFirst: vi.fn() },
  pipelineStage: { findFirst: vi.fn() },
  deal: { updateMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
  contact: { updateMany: vi.fn() },
  company: { updateMany: vi.fn() },
  conversation: { update: vi.fn(), updateMany: vi.fn() },
  task: { findMany: vi.fn(), updateMany: vi.fn() },
  aviso: { createMany: vi.fn() },
  automacao: { findUnique: vi.fn() },
  profile: { findMany: vi.fn() },
  contactChannel: { findMany: vi.fn() },
  metaConnection: { findUnique: vi.fn() },
  sequence: { findFirst: vi.fn() },
  sequenceEnrollment: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const crm = vi.hoisted(() => ({ createDeal: vi.fn(), findOpenDealForContact: vi.fn(), createTask: vi.fn(), addNote: vi.fn() }));
const externa = vi.hoisted(() => ({ enviarMensagemExterna: vi.fn() }));
const email = vi.hoisted(() => ({ enviarEmailDoContrato: vi.fn() }));
const rede = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crm", () => crm);
vi.mock("@/lib/server/mensagem-externa", () => externa);
vi.mock("@/lib/server/email/envio", () => email);
vi.mock("@/lib/server/ssrf", () => rede);
vi.mock("@/lib/server/eventos/alteracoes", () => ({ fotoDoRegistro: vi.fn(async () => ({})), publicarAlteracao: vi.fn() }));
vi.mock("@/lib/server/eventos/barramento", () => ({ publicarEvento: vi.fn() }));
vi.mock("@/lib/server/contacts", () => ({ applyTag: vi.fn(), removeTag: vi.fn() }));

import { MANIPULADORES } from "./index";
import { corpoDosCampos } from "./registro";
import { escolherNoRodizio, prazoDaTarefa } from "./pessoas";
import { destinoDoWhatsApp } from "./cliente";
import { explicarErroDeRede, interpretarResposta } from "./integracao";
import { ACOES } from "@/lib/automacoes/catalogo";
import { assinaturaConfere } from "@/lib/server/webhooks/assinatura";
import type { CtxDaAcao } from "./tipos";

const QUARTA_10H = new Date("2026-10-21T13:00:00Z");
const ctx = (over: Partial<CtxDaAcao> = {}): CtxDaAcao => ({
  orgId: "o1",
  automacaoId: "a1",
  execucaoId: "x1",
  noId: "n1",
  objeto: "deal",
  objetoId: "d1",
  contexto: { registro: { id: "d1", owner_id: null }, contato: { id: "c1", phone: "+5511987654321" }, empresa: {}, gatilho: {} },
  ids: { contato: "c1", empresa: null, negocio: "d1", conversa: "cv1", responsavel: "u1" },
  idempotencia: "x1:n1:1",
  teste: false,
  agora: QUARTA_10H,
  ...over,
});
const rodar = (tipo: string, config: Record<string, unknown>, c = ctx()) => MANIPULADORES[tipo]!(config, c);

beforeEach(() => {
  vi.clearAllMocks();
  db.membership.findMany.mockImplementation(async ({ where }: { where: { userId: { in: string[] } } }) => where.userId.in.filter((u) => u !== "saiu").map((userId) => ({ userId })));
});

describe("catálogo coberto", () => {
  it("toda ação do catálogo tem quem a execute", () => {
    expect(ACOES.map((a) => a.tipo).filter((t) => !MANIPULADORES[t])).toEqual([]);
  });
});

describe("registro", () => {
  it("campos viram o corpo da API: número, booleano, vazio limpa, personalizado agrupado", () => {
    expect(
      corpoDosCampos([
        { campo: "registro.amount_cents", valor: "1.500" },
        { campo: "registro.opt_in", valor: "false" },
        { campo: "registro.description", valor: "" },
        { campo: "registro.custom_fields.cpf", valor: "123" },
      ])
    ).toEqual({ amount_cents: 1500, opt_in: false, description: null, custom_fields: { cpf: "123" } });
  });

  it("criar negócio: pula se o contato já tem um aberto; etapa sumida é erro claro", async () => {
    crm.findOpenDealForContact.mockResolvedValueOnce({ id: "d9" });
    expect(await rodar("deal.create", { nome: "Novo", etapa: "s1" }, ctx({ objeto: "contact", objetoId: "c1" }))).toMatchObject({ ok: true, pulado: expect.stringMatching(/já tem negócio/) });
    crm.findOpenDealForContact.mockResolvedValueOnce(null);
    db.pipelineStage.findFirst.mockResolvedValueOnce(null);
    expect(await rodar("deal.create", { nome: "Novo", etapa: "s1" }, ctx({ objeto: "contact", objetoId: "c1" }))).toEqual({ ok: false, erro: "A etapa escolhida não existe mais." });
    crm.findOpenDealForContact.mockResolvedValueOnce(null);
    db.pipelineStage.findFirst.mockResolvedValueOnce({ id: "s1", pipelineId: "p1" });
    crm.createDeal.mockResolvedValueOnce({ id: "d2" });
    expect(await rodar("deal.create", { nome: "Novo", etapa: "s1", valor_centavos: "990" }, ctx({ objeto: "contact", objetoId: "c1" }))).toEqual({ ok: true, saida: { deal_id: "d2" } });
    expect(crm.createDeal.mock.calls[0][0]).toMatchObject({ contactId: "c1", stageId: "s1", pipelineId: "p1", amountCents: 990, ownerId: "u1", origem: "automacao" });
  });

  it("etiqueta que não existe mais: erro ao pôr, pulo ao tirar", async () => {
    db.tag.findFirst.mockResolvedValue(null);
    expect(await rodar("contact.add_tag", { tag: "t1" })).toMatchObject({ ok: false });
    expect(await rodar("contact.remove_tag", { tag: "t1" })).toMatchObject({ ok: true, pulado: expect.any(String) });
  });
});

describe("pessoas", () => {
  it("rodízio: igual alterna; 60/40 dá 3 e 2 a cada 5", () => {
    const contagem: Record<string, number> = {};
    const seq = Array.from({ length: 5 }, () => {
      const u = escolherNoRodizio(["a", "b"], contagem, { a: 60, b: 40 });
      contagem[u] = (contagem[u] ?? 0) + 1;
      return u;
    });
    expect(seq.filter((x) => x === "a")).toHaveLength(3);
    expect(escolherNoRodizio(["a", "b"], { a: 1 })).toBe("b");
  });

  it("prazo em dias úteis pula fim de semana", () => {
    // Sexta 23/10 10h + 1 dia útil = segunda 26/10 10h.
    expect(prazoDaTarefa(new Date("2026-10-23T13:00:00Z"), 1, "dias_uteis").toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });

  it("responsável fixo: só membro ativo; 'só se vazio' respeita quem já tem", async () => {
    expect(await rodar("owner.assign", { modo: "fixo", usuario: "saiu" })).toMatchObject({ ok: false });
    expect(await rodar("owner.assign", { modo: "fixo", usuario: "u2" })).toMatchObject({ ok: true, saida: { owner_id: "u2" } });
    expect(db.deal.updateMany).toHaveBeenCalledWith({ where: { id: "d1", orgId: "o1" }, data: { ownerId: "u2" } });
    const comDono = ctx({ contexto: { registro: { owner_id: "u9" }, contato: {} } });
    expect(await rodar("owner.assign", { modo: "fixo", usuario: "u2", so_se_vazio: true }, comDono)).toMatchObject({ ok: true, pulado: "já tem responsável" });
  });

  it("menos carga: quem tem menos negócios abertos", async () => {
    db.deal.groupBy.mockResolvedValue([{ ownerId: "u1", _count: { _all: 5 } }, { ownerId: "u2", _count: { _all: 1 } }]);
    expect(await rodar("owner.assign", { modo: "menos_carga", usuarios_carga: ["u1", "u2", "u3"] })).toMatchObject({ saida: { owner_id: "u3" } });
  });

  it("tarefa com prazo e responsável; avisar a equipe no app (sem e-mail no teste)", async () => {
    crm.createTask.mockResolvedValue({ id: "t1", dueAt: new Date("2026-10-23T13:00:00Z") });
    expect(await rodar("task.create", { texto: "Ligar", prazo: 2, unidade: "dias_uteis" })).toMatchObject({ ok: true, saida: { task_id: "t1", assigned_to_id: "u1" } });
    expect(crm.createTask.mock.calls[0][0]).toMatchObject({ dealId: "d1", contactId: "c1", origem: "automacao" });

    db.automacao.findUnique.mockResolvedValue({ nome: "Proposta parada" });
    db.aviso.createMany.mockResolvedValue({ count: 1 });
    const r = await rodar("team.notify", { mensagem: "Olhar o negócio", email: true }, ctx({ teste: true }));
    expect(r).toMatchObject({ ok: true, saida: { avisados: ["u1"], no_app: 1, emails: [] } });
    expect(db.aviso.createMany.mock.calls[0][0].data[0]).toMatchObject({ userId: "u1", titulo: "Automação: Proposta parada", link: "/negocios/d1" });
    expect(email.enviarEmailDoContrato).not.toHaveBeenCalled();
  });

  it("avisar sem responsável: pula", async () => {
    expect(await rodar("team.notify", { mensagem: "x" }, ctx({ ids: { contato: null, empresa: null, negocio: null, conversa: null, responsavel: null } }))).toMatchObject({ ok: true, pulado: expect.any(String) });
  });
});

describe("cliente", () => {
  it("destino do WhatsApp: a conversa, o canal do contato com o agente ou o telefone", async () => {
    const conversa = ctx({ objeto: "conversation", contexto: { registro: { channel: "whatsapp_qr", channel_contact_id: "5511999" }, contato: {} } });
    expect(await destinoDoWhatsApp(conversa, "a1", null)).toEqual({ channel: "whatsapp_qr", to: "5511999" });
    db.contactChannel.findMany.mockResolvedValueOnce([{ channel: "whatsapp_meta", externalId: "5511888" }]);
    expect(await destinoDoWhatsApp(ctx(), "a1", null)).toEqual({ channel: "whatsapp_meta", to: "5511888" });
    db.contactChannel.findMany.mockResolvedValueOnce([]);
    db.metaConnection.findUnique.mockResolvedValueOnce(null);
    expect(await destinoDoWhatsApp(ctx(), "a1", null)).toEqual({ channel: "whatsapp_qr", to: "5511987654321" });
  });

  it("WhatsApp com janela fechada: pula (padrão) ou falha", async () => {
    db.contactChannel.findMany.mockResolvedValue([{ channel: "whatsapp_meta", externalId: "5511888" }]);
    externa.enviarMensagemExterna.mockResolvedValue({ ok: false, status: 409, code: "window_closed", error: "janela" });
    expect(await rodar("whatsapp.send", { agente: "ag1", modo: "texto", texto: "Oi" })).toMatchObject({ ok: true, pulado: expect.stringMatching(/24h/) });
    expect(await rodar("whatsapp.send", { agente: "ag1", modo: "texto", texto: "Oi", sem_janela: "falhar" })).toMatchObject({ ok: false, retentavel: false });
    externa.enviarMensagemExterna.mockResolvedValue({ ok: false, status: 502, code: "delivery_failed", error: "Erro 130429 limite" });
    expect(await rodar("whatsapp.send", { agente: "ag1", modo: "texto", texto: "Oi" })).toMatchObject({ ok: false, retentavel: true });
  });

  it("e-mail: descadastrado pula; sem domínio falha; erro do provedor tenta de novo", async () => {
    email.enviarEmailDoContrato.mockResolvedValueOnce({ ok: false, motivo: "suprimido", erro: "não recebe" });
    expect(await rodar("email.send", { modelo: "m1" })).toMatchObject({ ok: true, pulado: "não recebe" });
    email.enviarEmailDoContrato.mockResolvedValueOnce({ ok: false, motivo: "sem_dominio", erro: "verifique" });
    expect(await rodar("email.send", { modelo: "m1" })).toMatchObject({ ok: false, retentavel: false });
    email.enviarEmailDoContrato.mockResolvedValueOnce({ ok: false, motivo: "erro", erro: "503" });
    expect(await rodar("email.send", { modelo: "m1" })).toMatchObject({ ok: false, retentavel: true });
  });

  it("passar para atendente: fila ou pessoa", async () => {
    expect(await rodar("conversation.handoff", {})).toMatchObject({ ok: true, saida: { conversation_id: "cv1", status: "waiting_human" } });
    expect(await rodar("conversation.handoff", { usuario: "u2" })).toMatchObject({ saida: { status: "human", assigned_to_id: "u2" } });
  });
});

describe("integração", () => {
  const resposta = (status: number, corpo = "", headers: Record<string, string> = {}) => new Response(corpo, { status, headers });

  it("2xx ok com JSON; 429/5xx tenta de novo (Retry-After); 4xx definitivo", async () => {
    expect(await interpretarResposta(resposta(200, '{"ok":1}'), Date.now())).toMatchObject({ ok: true, saida: { status: 200, resposta: { ok: 1 } } });
    expect(await interpretarResposta(resposta(429, "", { "retry-after": "30" }), Date.now())).toMatchObject({ ok: false, retentavel: true, tentarDepoisMs: 30_000 });
    expect(await interpretarResposta(resposta(404, "não"), Date.now())).toMatchObject({ ok: false, retentavel: false });
  });

  it("n8n com segredo: assinatura Standard Webhooks com o webhook-id do passo", async () => {
    rede.safeFetch.mockResolvedValue(resposta(200, "{}"));
    await rodar("n8n.webhook", { url: "https://n8n.x/webhook/1", segredo: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", extra: '{"a":1}' });
    const [, init] = rede.safeFetch.mock.calls[0];
    expect(init.headers["webhook-id"]).toBe("x1:n1:1");
    expect(JSON.parse(init.body)).toMatchObject({ automacao_id: "a1", registro: { id: "d1" }, extra: { a: 1 } });
    expect(assinaturaConfere("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", { id: init.headers["webhook-id"], timestamp: init.headers["webhook-timestamp"], signature: init.headers["webhook-signature"] }, init.body)).toBe(true);
  });

  it("HTTP: cabeçalhos em JSON, tipo do corpo deduzido; JSON inválido é erro", async () => {
    rede.safeFetch.mockResolvedValue(resposta(201, "criado"));
    expect(await rodar("http.request", { metodo: "POST", url: "https://api.x/y", cabecalhos: '{"Authorization":"Bearer t"}', corpo: '{"n":1}' })).toMatchObject({ ok: true, saida: { status: 201 } });
    const [, init] = rede.safeFetch.mock.calls[0];
    expect(init.headers).toMatchObject({ Authorization: "Bearer t", "Content-Type": "application/json", "Idempotency-Key": "x1:n1:1" });
    expect(await rodar("http.request", { url: "https://api.x/y", cabecalhos: "{quebrado" })).toMatchObject({ ok: false });
    rede.safeFetch.mockRejectedValue(new Error("Destino aponta pra um endereço interno."));
    const bloqueada = await rodar("http.request", { url: "http://10.0.0.1/x" });
    expect(bloqueada.ok).toBe(false);
    expect(!bloqueada.ok && bloqueada.retentavel).toBeFalsy();
  });
});

describe("erro de rede em português", () => {
  it("endereço que não existe, recusado, sem resposta e certificado", () => {
    const url = "https://hook.exemplo.com/webhook/abc";
    expect(explicarErroDeRede("getaddrinfo ENOTFOUND hook.exemplo.com", url)).toBe("Não achei o endereço hook.exemplo.com. Confira a URL do webhook (ENOTFOUND).");
    expect(explicarErroDeRede("connect ECONNREFUSED 1.2.3.4:443", url)).toMatch(/^hook\.exemplo\.com recusou a conexão/);
    expect(explicarErroDeRede("connect ETIMEDOUT", url)).toMatch(/não respondeu a tempo/);
    expect(explicarErroDeRede("unable to verify CERT_HAS_EXPIRED", url)).toMatch(/certificado de segurança/);
    expect(explicarErroDeRede("algo estranho", url)).toBe("Falha de rede ao chamar hook.exemplo.com: algo estranho");
  });
});
