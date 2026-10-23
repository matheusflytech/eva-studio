import "server-only";
import { prisma } from "@/lib/db/prisma";
import { atorDaAcao, type Ator } from "@/lib/server/eventos/barramento";
import type { AcaoDoHistorico, LinhaDoHistorico, Mudancas, ObjetoDoHistorico, TipoDoAtor } from "@/lib/historico/tipos";

// ---------------------------------------------------------------------------
// Histórico de alterações e auditoria (spec 2026-10-23).
//
// Uma linha por ação, gravada depois que a ação deu certo. Gravar nunca lança:
// a ação da pessoa já aconteceu, e perder uma linha do histórico é melhor que
// devolver erro de algo que foi salvo. Sem a tabela (SQL não aplicado), não
// grava e a leitura diz `disponivel: false`.
// ---------------------------------------------------------------------------

export const LIMITE_DE_TEXTO = 500;
export const RETENCAO_DO_HISTORICO_DIAS = 730;

export interface EntradaDoHistorico {
  orgId: string;
  acao: AcaoDoHistorico;
  objeto: ObjetoDoHistorico;
  objetoId: string;
  /** Sem ele, busca o nome do negócio/contato/empresa. */
  objetoNome?: string;
  mudancas?: Mudancas | null;
  detalhes?: Record<string, unknown>;
}

function semTabela(error: unknown): boolean {
  return /eva_studio_historico|does not exist|P2021/i.test(String((error as Error)?.message ?? error));
}

function cortar(v: unknown): unknown {
  return typeof v === "string" && v.length > LIMITE_DE_TEXTO ? `${v.slice(0, LIMITE_DE_TEXTO)}…` : v;
}

function cortarMudancas(m: Mudancas): Mudancas {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { de: cortar(v?.de ?? null), para: cortar(v?.para ?? null) }]));
}

const TIPOS_DE_ATOR = new Set<TipoDoAtor>(["usuario", "agente", "automacao", "api", "integracao", "sistema"]);

async function nomeDoAtor(orgId: string, ator: Ator): Promise<string> {
  try {
    if (ator.tipo === "usuario" && ator.id) return (await prisma.profile.findUnique({ where: { id: ator.id }, select: { name: true } }))?.name || "Pessoa";
    if (ator.tipo === "agente" && ator.id) return (await prisma.agent.findFirst({ where: { id: ator.id, orgId }, select: { name: true } }))?.name || "Agente de IA";
    if (ator.tipo === "automacao" && (ator.automacaoId ?? ator.id)) {
      const id = ator.automacaoId ?? ator.id!;
      return (await prisma.automacao.findFirst({ where: { id, orgId }, select: { nome: true } }))?.nome || "Automação";
    }
    if (ator.tipo === "api" && ator.id) {
      const k = await prisma.apiKey.findFirst({ where: { id: ator.id, orgId }, select: { name: true } });
      return k?.name ? `API · ${k.name}` : "API";
    }
  } catch {
    // nome é enfeite: sem ele, fica o rótulo do tipo
  }
  return { usuario: "Pessoa", agente: "Agente de IA", automacao: "Automação", api: "API", integracao: "Integração", sistema: "Sistema" }[ator.tipo];
}

async function nomeDoRegistro(orgId: string, objeto: ObjetoDoHistorico, id: string): Promise<string> {
  const where = { id, orgId };
  const select = { name: true } as const;
  try {
    if (objeto === "deal") return (await prisma.deal.findFirst({ where, select }))?.name ?? "";
    if (objeto === "contact") return (await prisma.contact.findFirst({ where, select }))?.name ?? "";
    if (objeto === "company") return (await prisma.company.findFirst({ where, select }))?.name ?? "";
  } catch {
    // idem
  }
  return "";
}

/** Grava uma linha. `ator` explícito vale mais que o do contexto. Nunca lança. */
export async function registrarHistorico(e: EntradaDoHistorico, atorExplicito?: Ator): Promise<void> {
  try {
    const ator = atorExplicito ?? (await atorDaAcao());
    if (ator.teste) return;
    const tipo: TipoDoAtor = TIPOS_DE_ATOR.has(ator.tipo as TipoDoAtor) ? (ator.tipo as TipoDoAtor) : "sistema";
    const [atorNome, objetoNome] = await Promise.all([
      nomeDoAtor(e.orgId, { ...ator, tipo }),
      e.objetoNome !== undefined ? Promise.resolve(e.objetoNome) : nomeDoRegistro(e.orgId, e.objeto, e.objetoId),
    ]);
    await prisma.historico.create({
      data: {
        orgId: e.orgId,
        acao: e.acao,
        objeto: e.objeto,
        objetoId: e.objetoId,
        objetoNome: objetoNome.slice(0, 300),
        mudancas: e.mudancas ? (cortarMudancas(e.mudancas) as object) : undefined,
        detalhes: (e.detalhes ?? {}) as object,
        atorTipo: tipo,
        atorId: (tipo === "automacao" ? (ator.automacaoId ?? ator.id) : ator.id) ?? null,
        atorNome: atorNome.slice(0, 200),
      },
      select: { id: true },
    });
  } catch (error) {
    if (!semTabela(error)) console.error("[historico] falha ao gravar", e.acao, e.objeto, error);
  }
}

export interface FiltroDoHistorico {
  objeto?: ObjetoDoHistorico | ObjetoDoHistorico[];
  objetoId?: string;
  acoes?: AcaoDoHistorico[];
  atorId?: string;
  atorTipo?: TipoDoAtor;
  de?: Date;
  ate?: Date;
  busca?: string;
  /** "<iso>|<id>" da última linha da página anterior. */
  cursor?: string | null;
  limite?: number;
}

export interface PaginaDoHistorico {
  disponivel: boolean;
  linhas: LinhaDoHistorico[];
  proximo: string | null;
}

function lerCursor(c: string | null | undefined): { em: Date; id: string } | null {
  if (!c) return null;
  const i = c.lastIndexOf("|");
  if (i <= 0) return null;
  const em = new Date(c.slice(0, i));
  return Number.isNaN(em.getTime()) ? null : { em, id: c.slice(i + 1) };
}

/** Mais recente primeiro, com cursor estável (createdAt + id). */
export async function listarHistorico(orgId: string, f: FiltroDoHistorico): Promise<PaginaDoHistorico> {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const cursor = lerCursor(f.cursor);
  const and: object[] = [];
  if (f.de || f.ate) and.push({ createdAt: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } });
  if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.em } }, { createdAt: cursor.em, id: { lt: cursor.id } }] });
  const busca = f.busca?.trim();
  try {
    const linhas = await prisma.historico.findMany({
      where: {
        orgId,
        ...(f.objeto ? { objeto: Array.isArray(f.objeto) ? { in: f.objeto } : f.objeto } : {}),
        ...(f.objetoId ? { objetoId: f.objetoId } : {}),
        ...(f.acoes?.length ? { acao: { in: f.acoes } } : {}),
        ...(f.atorId ? { atorId: f.atorId } : {}),
        ...(f.atorTipo ? { atorTipo: f.atorTipo } : {}),
        ...(busca ? { objetoNome: { contains: busca, mode: "insensitive" as const } } : {}),
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limite + 1,
    });
    const pagina = linhas.slice(0, limite).map(
      (l): LinhaDoHistorico => ({
        id: l.id,
        acao: l.acao as AcaoDoHistorico,
        objeto: l.objeto as ObjetoDoHistorico,
        objetoId: l.objetoId,
        objetoNome: l.objetoNome,
        mudancas: (l.mudancas ?? null) as Mudancas | null,
        detalhes: (l.detalhes ?? {}) as Record<string, unknown>,
        atorTipo: l.atorTipo as TipoDoAtor,
        atorId: l.atorId,
        atorNome: l.atorNome,
        em: l.createdAt.toISOString(),
      })
    );
    const ultima = pagina[pagina.length - 1];
    return { disponivel: true, linhas: pagina, proximo: linhas.length > limite && ultima ? `${ultima.em}|${ultima.id}` : null };
  } catch (error) {
    if (!semTabela(error)) throw error;
    return { disponivel: false, linhas: [], proximo: null };
  }
}

/** Passo da limpeza diária: o que passou de 2 anos. */
export async function limparHistoricoVencido(agora: Date = new Date()): Promise<number> {
  try {
    const r = await prisma.historico.deleteMany({ where: { createdAt: { lt: new Date(agora.getTime() - RETENCAO_DO_HISTORICO_DIAS * 86_400_000) } } });
    return r.count;
  } catch (error) {
    if (!semTabela(error)) throw error;
    return 0;
  }
}
