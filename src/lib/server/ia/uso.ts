import "server-only";
import { prisma } from "@/lib/db/prisma";
import { deParedeSP, partesEmSP } from "@/lib/fuso-sp";
import { LLM_PROVIDERS } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Uso e limite de IA por chave (Central de IA, F3c).
//
// Cada chamada ao provedor vira uma linha com os tokens que ele informou.
// O mês conta no horário de Brasília. O limite é em tokens por mês (exato);
// o custo em reais é estimado pelo preço por 1 milhão de tokens que o
// cliente informa por chave (sem preço, só tokens).
//
// Tudo tolerante: sem as tabelas (SQL 2026-10-21-uso-ia.sql não aplicado),
// nada é registrado, nenhum limite vale e a tela diz que falta ativar.
// ---------------------------------------------------------------------------

export interface RegistroDeUso {
  orgId: string;
  credentialId?: string | null;
  agentId?: string | null;
  recurso?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
}

export const ALERTA_EM = 0.8;

/** Primeiro instante do mês corrente em São Paulo. */
export function inicioDoMesSP(agora: Date = new Date()): Date {
  const p = partesEmSP(agora);
  return deParedeSP(p.ano, p.mes, 1, 0, 0, 0);
}

export function situacaoDoLimite(usado: number, limite: number | null | undefined): { pct: number | null; nivel: "sem_limite" | "ok" | "alerta" | "estourado" } {
  if (!limite || limite <= 0) return { pct: null, nivel: "sem_limite" };
  const pct = usado / limite;
  return { pct, nivel: pct >= 1 ? "estourado" : pct >= ALERTA_EM ? "alerta" : "ok" };
}

export function custoEstimado(tokens: number, precoMilhaoBrl: number | null | undefined): number | null {
  if (precoMilhaoBrl == null || !Number.isFinite(precoMilhaoBrl)) return null;
  return Math.round((tokens / 1_000_000) * precoMilhaoBrl * 100) / 100;
}

/** Grava o uso. Nunca lança: registrar consumo não pode derrubar a resposta ao cliente. */
export async function registrarUso(registros: RegistroDeUso[]): Promise<void> {
  if (registros.length === 0) return;
  try {
    await prisma.aiUsage.createMany({
      data: registros.map((r) => ({
        orgId: r.orgId,
        credentialId: r.credentialId ?? null,
        agentId: r.agentId ?? null,
        recurso: r.recurso ?? "fluxo",
        provider: r.provider,
        model: r.model,
        inputTokens: Math.max(0, Math.round(r.inputTokens)),
        outputTokens: Math.max(0, Math.round(r.outputTokens)),
        ok: r.ok,
      })),
    });
  } catch {
    // Tabela ainda não existe (ou banco instável): segue sem registrar.
  }
}

/** Chaves do contrato que já gastaram o limite do mês. Sem tabela = nenhuma. */
export async function chavesNoLimite(orgId: string, credentialIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(credentialIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const limites = await prisma.aiKeyLimit.findMany({
      where: { orgId, credentialId: { in: ids }, limiteMensalTokens: { gt: 0 } },
      select: { credentialId: true, limiteMensalTokens: true },
    });
    if (limites.length === 0) return new Set();
    const somas = await prisma.aiUsage.groupBy({
      by: ["credentialId"],
      where: { orgId, credentialId: { in: limites.map((l) => l.credentialId) }, createdAt: { gte: inicioDoMesSP() } },
      _sum: { inputTokens: true, outputTokens: true },
    });
    const usado = new Map(somas.map((s) => [s.credentialId, (s._sum.inputTokens ?? 0) + (s._sum.outputTokens ?? 0)]));
    return new Set(
      limites
        .filter((l) => situacaoDoLimite(usado.get(l.credentialId) ?? 0, l.limiteMensalTokens).nivel === "estourado")
        .map((l) => l.credentialId)
    );
  } catch {
    return new Set();
  }
}

export interface UsoDaChave {
  credentialId: string;
  nome: string;
  tipo: string;
  tokens: number;
  chamadas: number;
  falhas: number;
  limiteMensalTokens: number | null;
  precoMilhaoBrl: number | null;
  custoBrl: number | null;
  nivel: ReturnType<typeof situacaoDoLimite>["nivel"];
  pct: number | null;
}

export interface ResumoDeUso {
  disponivel: boolean;
  desde: string;
  chaves: UsoDaChave[];
  agentes: { agentId: string | null; nome: string; tokens: number; chamadas: number }[];
  plataforma: { tokens: number; chamadas: number };
}

export async function resumoDoMes(orgId: string): Promise<ResumoDeUso> {
  const desde = inicioDoMesSP();
  const tipos = LLM_PROVIDERS.map((p) => p.credentialType);
  const credenciais = await prisma.credential.findMany({
    where: { orgId, type: { in: tipos } },
    select: { id: true, name: true, type: true },
    orderBy: { createdAt: "asc" },
  });

  try {
    const [porChave, porAgente, limites] = await Promise.all([
      prisma.aiUsage.groupBy({
        by: ["credentialId", "ok"],
        where: { orgId, createdAt: { gte: desde } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.aiUsage.groupBy({
        by: ["agentId"],
        where: { orgId, createdAt: { gte: desde } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.aiKeyLimit.findMany({ where: { orgId }, select: { credentialId: true, limiteMensalTokens: true, precoMilhaoBrl: true } }),
    ]);

    const soma = (s: { _sum: { inputTokens: number | null; outputTokens: number | null } }) =>
      (s._sum.inputTokens ?? 0) + (s._sum.outputTokens ?? 0);
    const limitePor = new Map(limites.map((l) => [l.credentialId, l]));

    const chaves: UsoDaChave[] = credenciais.map((c) => {
      const linhas = porChave.filter((p) => p.credentialId === c.id);
      const tokens = linhas.reduce((t, l) => t + soma(l), 0);
      const lim = limitePor.get(c.id);
      const preco = lim?.precoMilhaoBrl != null ? Number(lim.precoMilhaoBrl) : null;
      const situacao = situacaoDoLimite(tokens, lim?.limiteMensalTokens);
      return {
        credentialId: c.id,
        nome: c.name,
        tipo: c.type,
        tokens,
        chamadas: linhas.reduce((t, l) => t + l._count._all, 0),
        falhas: linhas.filter((l) => !l.ok).reduce((t, l) => t + l._count._all, 0),
        limiteMensalTokens: lim?.limiteMensalTokens ?? null,
        precoMilhaoBrl: preco,
        custoBrl: custoEstimado(tokens, preco),
        ...situacao,
      };
    });

    const idsDeAgente = porAgente.map((a) => a.agentId).filter((id): id is string => !!id);
    const agentes = idsDeAgente.length
      ? await prisma.agent.findMany({ where: { orgId, id: { in: idsDeAgente } }, select: { id: true, name: true } })
      : [];
    const nomeDoAgente = new Map(agentes.map((a) => [a.id, a.name]));

    const plataforma = porChave.filter((p) => p.credentialId === null);
    return {
      disponivel: true,
      desde: desde.toISOString(),
      chaves,
      agentes: porAgente
        .map((a) => ({
          agentId: a.agentId,
          nome: a.agentId ? nomeDoAgente.get(a.agentId) ?? "Agente apagado" : "Fora dos agentes",
          tokens: soma(a),
          chamadas: a._count._all,
        }))
        .sort((x, y) => y.tokens - x.tokens),
      plataforma: { tokens: plataforma.reduce((t, l) => t + soma(l), 0), chamadas: plataforma.reduce((t, l) => t + l._count._all, 0) },
    };
  } catch {
    return {
      disponivel: false,
      desde: desde.toISOString(),
      chaves: credenciais.map((c) => ({
        credentialId: c.id, nome: c.name, tipo: c.type, tokens: 0, chamadas: 0, falhas: 0,
        limiteMensalTokens: null, precoMilhaoBrl: null, custoBrl: null, nivel: "sem_limite", pct: null,
      })),
      agentes: [],
      plataforma: { tokens: 0, chamadas: 0 },
    };
  }
}

/** Grava limite e preço de uma chave do próprio contrato. null limpa. */
export async function salvarLimite(
  orgId: string,
  credentialId: string,
  limiteBruto: unknown,
  precoBruto: unknown
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cred = await prisma.credential.findFirst({ where: { id: credentialId, orgId }, select: { id: true } });
  if (!cred) return { ok: false, status: 404, error: "Credencial não encontrada." };

  const limite = limiteBruto === null || limiteBruto === "" ? null : Math.round(Number(limiteBruto));
  const preco = precoBruto === null || precoBruto === "" ? null : Number(precoBruto);
  if (limite !== null && (!Number.isFinite(limite) || limite <= 0)) return { ok: false, status: 400, error: "Limite precisa ser um número de tokens maior que zero." };
  if (preco !== null && (!Number.isFinite(preco) || preco < 0)) return { ok: false, status: 400, error: "Preço precisa ser um valor em reais, zero ou mais." };

  try {
    await prisma.aiKeyLimit.upsert({
      where: { credentialId },
      create: { credentialId, orgId, limiteMensalTokens: limite, precoMilhaoBrl: preco },
      update: { limiteMensalTokens: limite, precoMilhaoBrl: preco },
    });
    return { ok: true };
  } catch {
    return { ok: false, status: 409, error: "O controle de uso ainda não foi ativado no banco (SQL 2026-10-21-uso-ia.sql)." };
  }
}
