import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Definicao } from "@/lib/automacoes/tipos";
import { exemploProposta } from "@/lib/automacoes/exemplo.test-helpers";

// Banco falso: uma execução, a automação e os passos gravados.
const estado = vi.hoisted(() => ({
  exec: null as Record<string, unknown> | null,
  automacao: { id: "a1", orgId: "o1", status: "ativa", objetivo: null as unknown, falhasSeguidas: 0, pausadaPor: null as string | null },
  passos: [] as Record<string, unknown>[],
  esperas: [] as Record<string, unknown>[],
  contexto: null as unknown,
}));

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(async () => {
    const e = estado.exec!;
    const livre = ["pendente", "esperando"].includes(e.status as string) && (!e.proximaEm || (e.proximaEm as Date) <= new Date(Date.now() + 1e12));
    if (!livre) return [];
    e.status = "rodando";
    e.travadaAte = new Date(Date.now() + 60_000);
    return [{ id: e.id }];
  }),
  automacaoExecucao: {
    findUnique: vi.fn(async () => ({ ...estado.exec, automacao: estado.automacao })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(estado.exec!, data)),
    // Gravação condicional: só pega se status e lease ainda são os esperados.
    updateMany: vi.fn(async ({ where, data }: { where: { status: string; travadaAte: Date | null }; data: Record<string, unknown> }) => {
      const e = estado.exec!;
      if (e.status !== where.status || (e.travadaAte as Date | null)?.getTime() !== where.travadaAte?.getTime()) return { count: 0 };
      Object.assign(e, data);
      return { count: 1 };
    }),
  },
  automacaoPasso: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => estado.passos.push(data)) },
  automacaoEspera: {
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => estado.esperas.push(create)),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  automacao: {
    update: vi.fn(async ({ data }: { data: { falhasSeguidas: { increment: number } } }) => {
      estado.automacao.falhasSeguidas += data.falhasSeguidas.increment;
      return { falhasSeguidas: estado.automacao.falhasSeguidas };
    }),
    updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(estado.automacao, data);
      return { count: 1 };
    }),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./contexto", () => ({ montarContexto: vi.fn(async () => estado.contexto) }));
vi.mock("./acoes", () => ({ MANIPULADORES: {} }));

import { executarExecucao, FALHAS_PARA_PAUSAR } from "./executor";
import type { ManipuladorDeAcao } from "./acoes";

// Quarta 10h em São Paulo: dentro do horário comercial.
const QUARTA_10H = new Date("2026-10-21T13:00:00Z");
const DOMINGO = new Date("2026-10-25T13:00:00Z");

function novaExecucao(def: Definicao, over: Record<string, unknown> = {}) {
  estado.exec = {
    id: "x1",
    orgId: "o1",
    automacaoId: "a1",
    objeto: def.objeto,
    objetoId: "d1",
    status: "pendente",
    noAtual: null,
    variaveis: {},
    gatilho: {},
    profundidade: 0,
    teste: false,
    iniciadaEm: QUARTA_10H,
    createdAt: QUARTA_10H,
    proximaEm: null,
    versao: { definicao: def },
    ...over,
  };
}

const ok: ManipuladorDeAcao = async (config) => ({ ok: true, saida: { feito: config } });
const manip = (extra: Record<string, ManipuladorDeAcao> = {}) => ({ "whatsapp.send": ok, "task.create": ok, "note.create": ok, "team.notify": ok, ...extra });
const status = () => estado.passos.map((p) => `${p.noId}:${p.status}${p.caminho ? `:${p.caminho}` : ""}`);

/** Sem a espera de 2 dias: cond → zap → tarefa, ou nota. */
function semEspera() {
  const d = exemploProposta();
  delete d.nos.espera;
  d.inicio = "cond";
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.passos = [];
  estado.esperas = [];
  estado.automacao = { id: "a1", orgId: "o1", status: "ativa", objetivo: null, falhasSeguidas: 0, pausadaPor: null };
  estado.contexto = { contexto: { registro: { stage_id: "s_prop" }, contato: { name: "Ana Souza", opt_in: true } }, ids: { contato: "c1" } };
});

describe("executor", () => {
  it("lease vencido no meio (outra batida assumiu): para sem repetir passos nem gravar o fim", async () => {
    novaExecucao(semEspera());
    const lenta: ManipuladorDeAcao = async (config) => {
      // O relógio devolveu à fila e outra batida pegou: o lease agora é dela.
      estado.exec!.travadaAte = new Date(Date.now() + 120_000);
      return { ok: true, saida: { feito: config } };
    };
    const r = await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": lenta }), agora: () => QUARTA_10H });
    expect(r).toBeNull();
    expect(status()).toEqual(["cond:ok:sim", "zap:ok"]);
    expect(estado.exec!.status).toBe("rodando");
    expect(estado.exec!.terminadaEm).toBeUndefined();
  });

  it("anda pelos passos, grava cada um com ms e termina concluída", async () => {
    novaExecucao(semEspera());
    const r = await executarExecucao("x1", { manipuladores: manip(), agora: () => QUARTA_10H });
    expect(r).toEqual({ status: "concluida" });
    expect(status()).toEqual(["cond:ok:sim", "zap:ok", "tarefa:ok"]);
    expect(estado.passos.every((p) => typeof p.ms === "number")).toBe(true);
    // Variável trocada antes da ação.
    expect((estado.passos[2].entrada as { config: { texto: string } }).config.texto).toBe("Ligar para Ana");
    expect(estado.exec!.terminadaEm).toBeInstanceOf(Date);
  });

  it("espera vira status esperando com a hora de voltar (sem dormir)", async () => {
    novaExecucao(exemploProposta());
    const r = await executarExecucao("x1", { manipuladores: manip(), agora: () => QUARTA_10H });
    expect(r).toEqual({ status: "esperando" });
    expect((estado.exec!.proximaEm as Date).toISOString()).toBe("2026-10-23T13:00:00.000Z");
    expect(status()).toEqual(["espera:esperando"]);
  });

  it("erro retentável: nova tentativa mais tarde; definitivo sem caminho de erro: falha e conta", async () => {
    novaExecucao(semEspera());
    const instavel: ManipuladorDeAcao = async () => ({ ok: false, erro: "429", retentavel: true });
    expect(await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": instavel }), agora: () => QUARTA_10H })).toEqual({ status: "esperando" });
    expect((estado.exec!.variaveis as { __tentativas: Record<string, number> }).__tentativas.zap).toBe(1);

    novaExecucao(semEspera());
    const quebrado: ManipuladorDeAcao = async () => ({ ok: false, erro: "número inválido" });
    expect(await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": quebrado }), agora: () => QUARTA_10H })).toEqual({ status: "falhou" });
    expect(estado.exec!.erro).toBe("número inválido");
    expect(estado.automacao.falhasSeguidas).toBe(1);
  });

  it(`${FALHAS_PARA_PAUSAR} falhas seguidas pausam a automação`, async () => {
    estado.automacao.falhasSeguidas = FALHAS_PARA_PAUSAR - 1;
    novaExecucao(semEspera());
    await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": async () => ({ ok: false, erro: "x" }) }), agora: () => QUARTA_10H });
    expect(estado.automacao.status).toBe("pausada");
    expect(estado.automacao.pausadaPor).toMatch(/Pausada sozinha/);
  });

  it("com caminho de erro: segue por ele", async () => {
    const d = semEspera();
    d.nos.zap = { ...d.nos.zap, erro: "aviso" } as typeof d.nos.zap;
    d.nos.aviso = { id: "aviso", tipo: "acao", acao: "team.notify", config: { mensagem: "falhou" }, proximo: null };
    novaExecucao(d);
    const r = await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": async () => ({ ok: false, erro: "fora do WhatsApp" }) }), agora: () => QUARTA_10H });
    expect(r).toEqual({ status: "concluida" });
    expect(status()).toEqual(["cond:ok:sim", "zap:falhou", "aviso:ok"]);
  });

  it("objetivo atingido encerra na hora", async () => {
    estado.automacao.objetivo = { grupos: [{ condicoes: [{ campo: "registro.stage_id", operador: "igual", valor: "s_prop" }] }] };
    novaExecucao(semEspera());
    expect(await executarExecucao("x1", { manipuladores: manip(), agora: () => QUARTA_10H })).toEqual({ status: "objetivo" });
    expect(estado.passos).toHaveLength(0);
  });

  it("cliente que não aceita mensagens: o WhatsApp é pulado, o resto segue", async () => {
    estado.contexto = { contexto: { registro: { stage_id: "s_prop" }, contato: { name: "Ana", opt_in: false } }, ids: {} };
    novaExecucao(semEspera());
    await executarExecucao("x1", { manipuladores: manip(), agora: () => QUARTA_10H });
    expect(status()).toEqual(["cond:ok:sim", "zap:pulado", "tarefa:ok"]);
  });

  it("fora do horário comercial: espera a próxima janela antes de falar com o cliente", async () => {
    novaExecucao(semEspera());
    const r = await executarExecucao("x1", { manipuladores: manip(), agora: () => DOMINGO });
    expect(r).toEqual({ status: "esperando" });
    const volta = estado.exec!.proximaEm as Date;
    expect(volta.getTime()).toBeGreaterThanOrEqual(new Date("2026-10-26T11:00:00Z").getTime()); // segunda 8h SP
    expect(volta.getTime()).toBeLessThan(new Date("2026-10-26T11:11:00Z").getTime());
  });

  it("teste: nenhuma ação roda de verdade (nem as internas) e a espera não espera", async () => {
    novaExecucao(exemploProposta(), { teste: true });
    const enviou = vi.fn(ok);
    const criouTarefa = vi.fn(ok);
    const r = await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": enviou, "task.create": criouTarefa }), agora: () => DOMINGO });
    expect(r).toEqual({ status: "concluida" });
    expect(enviou).not.toHaveBeenCalled();
    expect(criouTarefa).not.toHaveBeenCalled();
    expect(estado.passos.find((p) => p.noId === "tarefa")!.saida).toMatchObject({ simulado: true, faria: { texto: "Ligar para Ana" } });
    expect(estado.passos.find((p) => p.noId === "zap")!.saida).toMatchObject({ simulado: true });
    expect(estado.automacao.falhasSeguidas).toBe(0);
  });

  it("teste: “Enviar para o n8n” envia de verdade (marcado como teste); o resto segue simulado", async () => {
    const d = semEspera();
    // depois da tarefa, manda para o n8n
    const tarefa = d.nos.tarefa;
    if (tarefa.tipo !== "acao") throw new Error("o exemplo mudou: tarefa deveria ser uma ação");
    tarefa.proximo = "n8n";
    d.nos.n8n = { id: "n8n", tipo: "acao", acao: "n8n.webhook", config: { url: "https://n8n.exemplo.com/webhook/x" }, proximo: null };
    novaExecucao(d, { teste: true });
    const n8n = vi.fn<ManipuladorDeAcao>(async () => ({ ok: true, saida: { status: 200, ms: 12, resposta: { recebido: true } } }));
    const criouTarefa = vi.fn(ok);
    const r = await executarExecucao("x1", { manipuladores: manip({ "n8n.webhook": n8n, "task.create": criouTarefa }), agora: () => QUARTA_10H });
    expect(r).toEqual({ status: "concluida" });
    expect(criouTarefa).not.toHaveBeenCalled();
    expect(n8n).toHaveBeenCalledTimes(1);
    expect(n8n.mock.calls[0][1]).toMatchObject({ teste: true });
    expect(estado.passos.find((p) => p.noId === "n8n")!.saida).toMatchObject({ status: 200, resposta: { recebido: true } });
    expect(estado.passos.find((p) => p.noId === "tarefa")!.saida).toMatchObject({ simulado: true });
  });

  it("teste de verdade: as ações rodam de verdade e a espera de 2 dias vira 10 s", async () => {
    novaExecucao(exemploProposta(), { teste: true, variaveis: { __testeReal: { telefone: "5547999990000" } } });
    const enviou = vi.fn(ok);
    const r1 = await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": enviou }), agora: () => QUARTA_10H });
    expect(r1).toEqual({ status: "esperando" });
    expect((estado.exec!.proximaEm as Date).getTime()).toBe(QUARTA_10H.getTime() + 10_000);
    // a espera venceu: continua e roda as ações de verdade
    estado.exec!.status = "esperando";
    const depois = new Date(QUARTA_10H.getTime() + 11_000);
    const r2 = await executarExecucao("x1", { manipuladores: manip({ "whatsapp.send": enviou }), agora: () => depois });
    expect(r2).toEqual({ status: "concluida" });
    expect(enviou).toHaveBeenCalledTimes(1);
    expect(estado.passos.find((p) => p.noId === "tarefa")!.saida).not.toMatchObject({ simulado: true });
  });

  it("registro apagado: cancela; ação que ainda não existe: falha clara", async () => {
    estado.contexto = null;
    novaExecucao(semEspera());
    expect(await executarExecucao("x1", { manipuladores: manip() })).toEqual({ status: "cancelada" });

    estado.contexto = { contexto: { registro: { stage_id: "s_prop" }, contato: { opt_in: true } }, ids: {} };
    novaExecucao(semEspera());
    expect(await executarExecucao("x1", { manipuladores: {}, agora: () => QUARTA_10H })).toEqual({ status: "falhou" });
    expect(estado.exec!.erro).toMatch(/ainda não está disponível/);
  });

  it("automação pausada: a execução fica pausada, sem rodar passo", async () => {
    estado.automacao.status = "pausada";
    novaExecucao(semEspera());
    expect(await executarExecucao("x1", { manipuladores: manip() })).toEqual({ status: "pausada" });
    expect(estado.passos).toHaveLength(0);
  });

  it("outra batida já pegou: não faz nada", async () => {
    novaExecucao(semEspera(), { status: "rodando" });
    expect(await executarExecucao("x1", { manipuladores: manip() })).toBeNull();
  });
});
