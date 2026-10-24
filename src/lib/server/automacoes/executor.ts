import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { comAtor } from "@/lib/server/eventos/barramento";
import { acaoDoTipo } from "@/lib/automacoes/catalogo";
import { dentroDaJanela, proximaJanela } from "@/lib/automacoes/calendario";
import { avaliarRegra } from "@/lib/automacoes/condicoes";
import { decidir, type EstadoDaEspera } from "@/lib/automacoes/interpretar";
import { renderizarConfig } from "@/lib/automacoes/variaveis";
import type { Definicao, No, Objeto, Regra } from "@/lib/automacoes/tipos";
import { montarContexto } from "./contexto";
import { MANIPULADORES, type ManipuladorDeAcao } from "./acoes";

/** Ações que, no Testar, rodam de verdade: só falam com um sistema de fora (o n8n da pessoa) e não mudam nada no CRM. */
const ENVIA_DE_VERDADE_NO_TESTE = new Set(["n8n.webhook"]);

// ---------------------------------------------------------------------------
// Executor das automações: pega uma execução (FOR UPDATE SKIP LOCKED com
// lease de 60 s), anda até 20 passos e grava cada passo com o tempo em ms.
// Espera é uma linha (status "esperando" + proximaEm), nunca uma função
// dormindo: o relógio retoma. Regras (skill crm-automation-engine):
// - contexto relido a cada passo; objetivo atingido encerra na hora;
// - ação que fala com o cliente respeita opt-out e horário comercial (8h–20h);
// - erro retentável: nova tentativa com espera crescente, até 6; definitivo:
//   caminho de erro do passo ou a execução falha;
// - 10 falhas seguidas pausam a automação (e o Início avisa);
// - teste: nenhuma ação muda nada (só mostra o que faria) e as esperas não esperam.
// ---------------------------------------------------------------------------

export const PASSOS_POR_RODADA = 20;
export const MAX_PASSOS = 500;
export const MAX_TENTATIVAS = 6;
export const FALHAS_PARA_PAUSAR = 10;
const LEASE_SEG = 60;
const LIMITE_JSON = 16_000;

interface Variaveis {
  passos?: Record<string, unknown>;
  __espera?: EstadoDaEspera | null;
  __tentativas?: Record<string, number>;
  __janela?: string | null;
  __contagem?: number;
  /** Teste de verdade (registro de teste criado para isso): passos rodam de verdade. */
  __testeReal?: { telefone: string; apagado?: boolean } | null;
}

/** No teste de verdade as esperas encolhem: duração vira 10 s; esperar evento, 1 min (dá tempo de responder). */
const ESPERA_DO_TESTE_MS = 10_000;
const ESPERA_DE_EVENTO_DO_TESTE_MS = 60_000;

type Fim = "concluida" | "falhou" | "cancelada" | "objetivo";

/** JSON pequeno para o log (corta o que passa de ~16 KB). */
function enxuto(v: unknown): unknown {
  if (v === undefined) return undefined;
  try {
    const s = JSON.stringify(v);
    if (s.length <= LIMITE_JSON) return v;
    return { cortado: true, inicio: s.slice(0, LIMITE_JSON) };
  } catch {
    return { erro: "não serializável" };
  }
}

/** Espera crescente com variação: 30 s, 1 min, 2 min... até 1 h. */
export function esperaDaTentativa(tentativa: number, pedido?: number): number {
  const base = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, tentativa - 1));
  const jitter = Math.floor(Math.random() * base * 0.2);
  return Math.max(base + jitter, pedido ?? 0);
}

async function gravarPasso(execucaoId: string, no: No | { id: string; tipo: string; rotulo?: string }, d: {
  status: string;
  inicio: Date;
  caminho?: string;
  entrada?: unknown;
  saida?: unknown;
  erro?: string;
  tentativa?: number;
}) {
  const fim = new Date();
  await prisma.automacaoPasso.create({
    data: {
      execucaoId,
      noId: no.id,
      tipo: no.tipo === "acao" ? (no as Extract<No, { tipo: "acao" }>).acao : no.tipo,
      rotulo: no.rotulo ?? "",
      status: d.status,
      tentativa: d.tentativa ?? 1,
      entrada: enxuto(d.entrada) as object | undefined,
      saida: enxuto(d.saida) as object | undefined,
      erro: d.erro?.slice(0, 2000),
      caminho: d.caminho,
      iniciadoEm: d.inicio,
      terminadoEm: fim,
      ms: fim.getTime() - d.inicio.getTime(),
    },
  });
}

/** Marca a execução para rodar agora (pendente) se estiver livre. Devolve se pegou. */
async function pegar(id: string): Promise<boolean> {
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "eva_studio_automacao_execucoes"
    SET "status" = 'rodando',
        "travadaAte" = NOW() + make_interval(secs => ${LEASE_SEG}),
        "iniciadaEm" = COALESCE("iniciadaEm", NOW()),
        "updatedAt" = NOW()
    WHERE "id" = ${id}
      AND "status" IN ('pendente', 'esperando')
      AND ("proximaEm" IS NULL OR "proximaEm" <= NOW())
      AND ("travadaAte" IS NULL OR "travadaAte" < NOW())
    RETURNING "id"`;
  return linhas.length > 0;
}

export interface OpcoesDoExecutor {
  /** Para testes: substitui as ações reais. */
  manipuladores?: Partial<Record<string, ManipuladorDeAcao>>;
  agora?: () => Date;
}

/**
 * Roda uma execução até esperar, terminar ou completar a rodada. Seguro de
 * chamar à toa: se outra batida já pegou (ou não está na hora), não faz nada.
 */
export async function executarExecucao(id: string, opcoes: OpcoesDoExecutor = {}): Promise<{ status: string } | null> {
  const agora = opcoes.agora ?? (() => new Date());
  const manipuladores = opcoes.manipuladores ?? MANIPULADORES;
  if (!(await pegar(id))) return null;

  const exec = await prisma.automacaoExecucao.findUnique({
    where: { id },
    include: { versao: { select: { definicao: true } }, automacao: { select: { id: true, orgId: true, status: true, objetivo: true } } },
  });
  if (!exec) return null;
  const def = exec.versao.definicao as unknown as Definicao;
  const variaveis: Variaveis = { passos: {}, ...((exec.variaveis ?? {}) as Variaveis) };
  let noAtual = exec.noAtual ?? (variaveis.__contagem ? null : def.inicio);
  // Teste de verdade: roda as ações (num registro de teste) e espera de verdade, só que curto.
  const testeReal = exec.teste && !!variaveis.__testeReal;
  const objetivo = exec.automacao.objetivo as Regra | null;

  // Lease desta rodada. Toda gravação confere que ele ainda é nosso: se o
  // relógio devolveu a execução à fila (lease vencido) e outra batida pegou,
  // esta rodada para sem gravar, em vez de repetir passos e brigar pelo status.
  let lease = exec.travadaAte;
  const gravar = async (data: Prisma.AutomacaoExecucaoUpdateManyMutationInput) =>
    (await prisma.automacaoExecucao.updateMany({ where: { id, status: "rodando", travadaAte: lease }, data })).count > 0;

  const finalizar = async (status: Fim, erro?: string) => {
    const fim = agora();
    const nossa = await gravar({
      status,
      erro: erro ?? null,
      noAtual,
      variaveis: variaveis as object,
      terminadaEm: fim,
      duracaoMs: fim.getTime() - (exec.iniciadaEm ?? exec.createdAt).getTime(),
      proximaEm: null,
      travadaAte: null,
    });
    if (!nossa) return null;
    await prisma.automacaoEspera.deleteMany({ where: { execucaoId: id } });
    if (exec.teste) return { status };
    if (status === "falhou") {
      const a = await prisma.automacao.update({ where: { id: exec.automacaoId }, data: { falhasSeguidas: { increment: 1 } }, select: { falhasSeguidas: true } });
      if (a.falhasSeguidas >= FALHAS_PARA_PAUSAR) {
        await prisma.automacao.updateMany({
          where: { id: exec.automacaoId, status: "ativa" },
          data: { status: "pausada", pausadaPor: `Pausada sozinha: ${a.falhasSeguidas} execuções seguidas falharam. Última: ${erro ?? "erro"}` },
        });
      }
    } else if (status === "concluida" || status === "objetivo") {
      await prisma.automacao.updateMany({ where: { id: exec.automacaoId, falhasSeguidas: { gt: 0 } }, data: { falhasSeguidas: 0 } });
    }
    return { status };
  };

  const dormir = async (ate: Date) => {
    const nossa = await gravar({ status: "esperando", noAtual, variaveis: variaveis as object, proximaEm: ate, travadaAte: null });
    return nossa ? { status: "esperando" } : null;
  };

  // Automação pausada (ou desligada) depois de inscrever: a execução espera, não some.
  if (exec.automacao.status !== "ativa" && !exec.teste) {
    await prisma.automacaoExecucao.update({ where: { id }, data: { status: "pausada", travadaAte: null } });
    return { status: "pausada" };
  }

  for (let rodada = 0; rodada < PASSOS_POR_RODADA; rodada++) {
    // Antes de cada passo: grava onde está e renova o lease.
    const renovado = new Date(Date.now() + LEASE_SEG * 1000);
    if (!(await gravar({ noAtual, variaveis: variaveis as object, travadaAte: renovado }))) return null;
    lease = renovado;

    variaveis.__contagem = (variaveis.__contagem ?? 0) + 1;
    if (variaveis.__contagem > MAX_PASSOS) return finalizar("falhou", `Mais de ${MAX_PASSOS} passos numa execução (loop?).`);

    const agoraDoPasso = agora();
    const montado = await montarContexto(exec.orgId, exec.objeto as Objeto, exec.objetoId, { gatilho: exec.gatilho as Record<string, unknown>, passos: variaveis.passos }, agoraDoPasso);
    if (!montado) return finalizar("cancelada", "O registro não existe mais.");
    const { contexto, ids } = montado;

    if (objetivo && objetivo.grupos?.some((g) => g.condicoes?.length) && avaliarRegra(objetivo, contexto, agoraDoPasso)) {
      return finalizar("objetivo");
    }

    // Teste: espera não espera (vale como vencida).
    const espera = variaveis.__espera && exec.teste && !testeReal ? { ...variaveis.__espera, ate: agoraDoPasso.toISOString() } : variaveis.__espera;
    const mov = decidir(def, noAtual, contexto, agoraDoPasso, espera);
    const no = noAtual ? def.nos[noAtual] : undefined;

    if (mov.tipo === "fim") {
      if (no) await gravarPasso(id, no, { status: "ok", inicio: agoraDoPasso });
      return finalizar("concluida");
    }
    if (mov.tipo === "erro") return finalizar("falhou", mov.mensagem);

    if (mov.tipo === "seguir") {
      await gravarPasso(id, no!, { status: "ok", inicio: agoraDoPasso, caminho: mov.saida, saida: mov.detalhe });
      if (variaveis.__espera?.noId === noAtual) variaveis.__espera = null;
      noAtual = mov.para;
      continue;
    }

    if (mov.tipo === "esperar") {
      const primeiraVez = variaveis.__espera?.noId !== mov.espera.noId;
      if (testeReal && primeiraVez) {
        const curto = new Date(agoraDoPasso.getTime() + (mov.registrar ? ESPERA_DE_EVENTO_DO_TESTE_MS : ESPERA_DO_TESTE_MS));
        if (curto < mov.ate) {
          mov.ate = curto;
          mov.espera = { ...mov.espera, ate: curto.toISOString() };
        }
      }
      variaveis.__espera = mov.espera;
      if (primeiraVez) {
        await gravarPasso(id, no!, { status: "esperando", inicio: agoraDoPasso, saida: { ate: mov.espera.ate } });
        if (mov.registrar) {
          await prisma.automacaoEspera.upsert({
            where: { execucaoId: id },
            create: { orgId: exec.orgId, execucaoId: id, noId: mov.espera.noId, tipo: mov.registrar.evento, objeto: exec.objeto, objetoId: exec.objetoId, expiraEm: mov.ate },
            update: { noId: mov.espera.noId, tipo: mov.registrar.evento, expiraEm: mov.ate },
          });
        }
      }
      if (exec.teste && !testeReal) continue;
      return dormir(mov.ate);
    }

    // ---- ação ----
    const noAcao = mov.no;
    const item = acaoDoTipo(noAcao.acao);
    if (item?.falaComCliente) {
      const contato = contexto.contato as Record<string, unknown>;
      if (contato.opt_in === false) {
        await gravarPasso(id, noAcao, { status: "pulado", inicio: agoraDoPasso, saida: { motivo: "o contato não aceita mensagens" } });
        noAtual = noAcao.proximo;
        continue;
      }
      if (!exec.teste && !dentroDaJanela(agoraDoPasso)) {
        // Fora do horário comercial: espera a próxima janela (com até 10 min de variação).
        const ate = new Date(proximaJanela(agoraDoPasso).getTime() + Math.floor(Math.random() * 600_000));
        if (variaveis.__janela !== noAcao.id) {
          variaveis.__janela = noAcao.id;
          await gravarPasso(id, noAcao, { status: "esperando", inicio: agoraDoPasso, saida: { motivo: "fora do horário comercial", ate: ate.toISOString() } });
        }
        return dormir(ate);
      }
    }
    variaveis.__janela = null;

    const tentativa = (variaveis.__tentativas?.[noAcao.id] ?? 0) + 1;
    const faltando: string[] = [];
    const config = renderizarConfig(noAcao.config ?? {}, contexto, faltando);
    const manipulador = manipuladores[noAcao.acao];
    let r: Awaited<ReturnType<ManipuladorDeAcao>>;
    if (!manipulador) r = { ok: false, erro: `A ação “${item?.nome ?? noAcao.acao}” ainda não está disponível.` };
    // Teste (modo seguro): nenhuma ação muda nada; o passo mostra o que faria.
    // Exceção: "Enviar para o n8n" envia de verdade (com "teste": true no corpo),
    // senão não há como ver o fluxo do n8n receber antes de publicar.
    else if (exec.teste && !testeReal && !ENVIA_DE_VERDADE_NO_TESTE.has(noAcao.acao)) r = { ok: true, saida: { simulado: true, faria: config } };
    else {
      try {
        r = await comAtor({ tipo: "automacao", automacaoId: exec.automacaoId, execucaoId: id, profundidade: exec.profundidade + 1, ...(exec.teste ? { teste: true } : {}) }, () =>
          manipulador(config, {
            orgId: exec.orgId,
            automacaoId: exec.automacaoId,
            execucaoId: id,
            noId: noAcao.id,
            objeto: exec.objeto as Objeto,
            objetoId: exec.objetoId,
            contexto,
            ids,
            idempotencia: `${id}:${noAcao.id}:${tentativa}`,
            teste: exec.teste,
            agora: agoraDoPasso,
          })
        );
      } catch (e) {
        // Exceção inesperada: tenta de novo (pode ser banco instável).
        r = { ok: false, erro: e instanceof Error ? e.message : String(e), retentavel: true };
      }
    }

    const entrada = faltando.length ? { config, variaveis_vazias: faltando } : { config };
    if (r.ok) {
      await gravarPasso(id, noAcao, { status: r.pulado ? "pulado" : "ok", inicio: agoraDoPasso, entrada, saida: r.pulado ? { motivo: r.pulado } : r.saida, tentativa });
      variaveis.passos = { ...variaveis.passos, [noAcao.id]: r.saida ?? {} };
      if (variaveis.__tentativas) delete variaveis.__tentativas[noAcao.id];
      noAtual = noAcao.proximo;
      continue;
    }

    await gravarPasso(id, noAcao, { status: "falhou", inicio: agoraDoPasso, entrada, erro: r.erro, tentativa });
    if (r.retentavel && tentativa < MAX_TENTATIVAS && !exec.teste) {
      variaveis.__tentativas = { ...variaveis.__tentativas, [noAcao.id]: tentativa };
      return dormir(new Date(agoraDoPasso.getTime() + esperaDaTentativa(tentativa, r.tentarDepoisMs)));
    }
    if (noAcao.erro !== undefined) {
      variaveis.passos = { ...variaveis.passos, [noAcao.id]: { erro: r.erro } };
      noAtual = noAcao.erro ?? null;
      continue;
    }
    return finalizar("falhou", r.erro);
  }

  // Rodada cheia: volta para a fila e a próxima batida continua.
  const nossa = await gravar({ status: "pendente", noAtual, variaveis: variaveis as object, proximaEm: agora(), travadaAte: null });
  return nossa ? { status: "pendente" } : null;
}
