import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { tabelaAusente } from "@/lib/server/layout-do-cartao";
import { ctxPode, type SessionContext } from "@/lib/server/permissions";
import type { EntidadeCrm } from "@/lib/filtro-crm";
import {
  LIMITE_DE_VISOES_POR_PESSOA,
  VISOES_DE_SISTEMA,
  conferirVisibilidade,
  ehVisibilidade,
  nomeDaVisao,
  podeMexer,
  podeVer,
  sanearConfig,
  type QuemOlha,
  type VisaoSalva,
  type Visibilidade,
} from "@/lib/visoes/visoes";

// ---------------------------------------------------------------------------
// Visões salvas no banco (eva_studio_saved_views + _defaults; SQL
// prisma/sql/2026-10-20-visoes-salvas.sql). Toda leitura e escrita é presa ao
// contrato ativo (orgId) e à visibilidade (src/lib/visoes/visoes.ts: podeVer /
// podeMexer). Sem as tabelas no banco: a leitura volta vazia com
// `disponivel: false` (a tela fica nas visões de sistema) e a escrita responde
// 409 `visoes_indisponiveis`.
// ---------------------------------------------------------------------------

type Ctx = Pick<SessionContext, "userId" | "orgId" | "role" | "permissoes">;

export class ErroDeVisao extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409,
    public codigo: string
  ) {
    super(message);
  }
}

const INDISPONIVEL = () =>
  new ErroDeVisao("Salvar visões ainda não está ativado neste contrato (falta aplicar o SQL das visões).", 409, "visoes_indisponiveis");

// Tabela que passou a existir não deixa de existir: só o "sim" fica guardado.
let confirmada = false;

/** Só para os testes. */
export function _esquecerSondagem() {
  confirmada = false;
}

export async function visoesAtivadas(): Promise<boolean> {
  if (confirmada) return true;
  try {
    await prisma.savedView.findFirst({ select: { id: true } });
    confirmada = true;
    return true;
  } catch (e) {
    if (tabelaAusente(e) || /eva_studio_saved_view/i.test(e instanceof Error ? e.message : "")) return false;
    throw e;
  }
}

/** Quem administra o contrato compartilha com todos e mexe nas compartilhadas. */
export function ehAdminDeVisoes(ctx: Pick<SessionContext, "role" | "permissoes">): boolean {
  return ctxPode(ctx, "membros:gerenciar") || ctxPode(ctx, "funis:configurar");
}

export async function quemOlha(ctx: Ctx): Promise<QuemOlha> {
  const equipes = await prisma.teamMember.findMany({ where: { userId: ctx.userId, team: { orgId: ctx.orgId } }, select: { teamId: true } });
  return { userId: ctx.userId, equipes: equipes.map((e) => e.teamId), admin: ehAdminDeVisoes(ctx) };
}

type Linha = {
  id: string;
  entity: string;
  pipelineId: string | null;
  name: string;
  ownerId: string;
  visibility: string;
  teamId: string | null;
  config: unknown;
  position: number;
};

function paraVisao(l: Linha, q: QuemOlha, nomes: Map<string, string>): VisaoSalva {
  const entidade = l.entity as EntidadeCrm;
  return {
    id: l.id,
    entidade,
    pipelineId: l.pipelineId,
    nome: l.name,
    donoId: l.ownerId,
    donoNome: nomes.get(l.ownerId) ?? "",
    visibilidade: (ehVisibilidade(l.visibility) ? l.visibility : "pessoal") as Visibilidade,
    teamId: l.teamId,
    config: sanearConfig(l.config, VISOES_DE_SISTEMA[entidade] ?? ["todos"]),
    posicao: l.position,
    podeEditar: podeMexer(l, q),
  };
}

async function nomesDosDonos(donos: string[]): Promise<Map<string, string>> {
  if (!donos.length) return new Map();
  const ps = await prisma.profile.findMany({ where: { id: { in: [...new Set(donos)] } }, select: { id: true, name: true, email: true } });
  return new Map(ps.map((p) => [p.id, p.name || p.email || ""]));
}

/** `where` das visões que a pessoa enxerga nesta lista (e neste funil). */
function whereVisiveis(ctx: Ctx, q: QuemOlha, entidade: EntidadeCrm, pipelineId?: string | null): Prisma.SavedViewWhereInput {
  return {
    orgId: ctx.orgId,
    entity: entidade,
    AND: [
      {
        OR: [
          { ownerId: ctx.userId },
          { visibility: "contrato" },
          ...(q.equipes.length ? [{ visibility: "equipe", teamId: { in: [...q.equipes] } }] : []),
        ],
      },
      ...(entidade === "negocios" && pipelineId ? [{ OR: [{ pipelineId: null }, { pipelineId }] }] : []),
    ],
  };
}

export interface ListaDeVisoes {
  disponivel: boolean;
  visoes: VisaoSalva[];
  /** Visão padrão da pessoa nesta lista (id de salva ou de sistema), ou null. */
  padrao: string | null;
}

export async function listarVisoes(ctx: Ctx, entidade: EntidadeCrm, pipelineId?: string | null): Promise<ListaDeVisoes> {
  if (!(await visoesAtivadas())) return { disponivel: false, visoes: [], padrao: null };
  const q = await quemOlha(ctx);
  const [linhas, padrao] = await Promise.all([
    prisma.savedView.findMany({ where: whereVisiveis(ctx, q, entidade, pipelineId), orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 200 }),
    prisma.savedViewDefault.findUnique({ where: { orgId_userId_entity: { orgId: ctx.orgId, userId: ctx.userId, entity: entidade } } }),
  ]);
  const nomes = await nomesDosDonos(linhas.map((l) => l.ownerId));
  const visoes = linhas.map((l) => paraVisao(l, q, nomes));
  // Padrão que sumiu (apagada, deixou de ser compartilhada) volta a ser nenhum.
  const chave = padrao?.viewKey ?? null;
  const valido = chave && (VISOES_DE_SISTEMA[entidade].includes(chave) || visoes.some((v) => v.id === chave)) ? chave : null;
  return { disponivel: true, visoes, padrao: valido };
}

/** Lê uma visão que a pessoa enxerga, ou 404 (de outro contrato ou sem acesso dá o mesmo 404). */
async function lerVisivel(ctx: Ctx, q: QuemOlha, id: string): Promise<Linha> {
  const l = await prisma.savedView.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!l || !podeVer(l, q)) throw new ErroDeVisao("Visão não encontrada.", 404, "nao_encontrada");
  return l;
}

async function conferirEquipeEFunil(ctx: Ctx, teamId: string | null, pipelineId: string | null): Promise<void> {
  if (teamId && !(await prisma.team.findFirst({ where: { id: teamId, orgId: ctx.orgId }, select: { id: true } }))) {
    throw new ErroDeVisao("Equipe não encontrada.", 404, "equipe_nao_encontrada");
  }
  if (pipelineId && !(await prisma.pipeline.findFirst({ where: { id: pipelineId, orgId: ctx.orgId }, select: { id: true } }))) {
    throw new ErroDeVisao("Funil não encontrado.", 404, "funil_nao_encontrado");
  }
}

export interface EntradaDaVisao {
  entidade: EntidadeCrm;
  nome: unknown;
  visibilidade?: unknown;
  teamId?: unknown;
  pipelineId?: unknown;
  config: unknown;
}

const idOuNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 64) : null);

/** Cria (o "+", "Duplicar" e "Salvar como nova"). Sempre do usuário logado. */
export async function criarVisao(ctx: Ctx, e: EntradaDaVisao): Promise<VisaoSalva> {
  if (!(await visoesAtivadas())) throw INDISPONIVEL();
  const nome = nomeDaVisao(e.nome);
  if (!nome) throw new ErroDeVisao("Dê um nome para a visão.", 400, "nome_obrigatorio");
  const visibilidade: Visibilidade = e.visibilidade === undefined ? "pessoal" : ehVisibilidade(e.visibilidade) ? e.visibilidade : ("" as Visibilidade);
  if (!visibilidade) throw new ErroDeVisao("Visibilidade inválida.", 400, "visibilidade_invalida");
  const teamId = visibilidade === "equipe" ? idOuNull(e.teamId) : null;
  const pipelineId = e.entidade === "negocios" ? idOuNull(e.pipelineId) : null;
  const q = await quemOlha(ctx);
  const recusa = conferirVisibilidade(visibilidade, teamId, q);
  if (recusa) throw new ErroDeVisao(recusa, 403, "visibilidade_negada");
  await conferirEquipeEFunil(ctx, teamId, pipelineId);
  const minhas = await prisma.savedView.count({ where: { orgId: ctx.orgId, entity: e.entidade, ownerId: ctx.userId } });
  if (minhas >= LIMITE_DE_VISOES_POR_PESSOA) {
    throw new ErroDeVisao(`Você já tem ${LIMITE_DE_VISOES_POR_PESSOA} visões nesta lista. Apague alguma antes.`, 409, "limite_de_visoes");
  }
  const ultima = await prisma.savedView.findFirst({ where: { orgId: ctx.orgId, entity: e.entidade }, orderBy: { position: "desc" }, select: { position: true } });
  const config = sanearConfig(e.config, VISOES_DE_SISTEMA[e.entidade]);
  const l = await prisma.savedView.create({
    data: {
      orgId: ctx.orgId,
      entity: e.entidade,
      pipelineId,
      name: nome,
      ownerId: ctx.userId,
      visibility: visibilidade,
      teamId,
      config: config as unknown as Prisma.InputJsonValue,
      position: (ultima?.position ?? 0) + 1,
    },
  });
  return paraVisao(l, q, await nomesDosDonos([l.ownerId]));
}

export interface AlteracaoDaVisao {
  nome?: unknown;
  visibilidade?: unknown;
  teamId?: unknown;
  config?: unknown;
  posicao?: unknown;
}

/** Renomear, mudar visibilidade, salvar alterações, mover. Só quem pode mexer. */
export async function alterarVisao(ctx: Ctx, id: string, a: AlteracaoDaVisao): Promise<VisaoSalva> {
  if (!(await visoesAtivadas())) throw INDISPONIVEL();
  const q = await quemOlha(ctx);
  const atual = await lerVisivel(ctx, q, id);
  if (!podeMexer(atual, q)) {
    throw new ErroDeVisao("Esta visão é de outra pessoa: use “Salvar como nova” para guardar a sua versão.", 403, "sem_permissao");
  }
  const data: Prisma.SavedViewUpdateInput = {};
  if (a.nome !== undefined) {
    const nome = nomeDaVisao(a.nome);
    if (!nome) throw new ErroDeVisao("Dê um nome para a visão.", 400, "nome_obrigatorio");
    data.name = nome;
  }
  if (a.visibilidade !== undefined) {
    if (!ehVisibilidade(a.visibilidade)) throw new ErroDeVisao("Visibilidade inválida.", 400, "visibilidade_invalida");
    const teamId = a.visibilidade === "equipe" ? idOuNull(a.teamId) : null;
    // Admin mexendo na visão compartilhada de outra pessoa não a torna "só eu" dele.
    if (a.visibilidade === "pessoal" && atual.ownerId !== ctx.userId) {
      throw new ErroDeVisao("Só o dono deixa a visão como “Só eu”.", 403, "visibilidade_negada");
    }
    const recusa = conferirVisibilidade(a.visibilidade, teamId, q);
    if (recusa) throw new ErroDeVisao(recusa, 403, "visibilidade_negada");
    await conferirEquipeEFunil(ctx, teamId, null);
    data.visibility = a.visibilidade;
    data.teamId = teamId;
  }
  if (a.config !== undefined) {
    data.config = sanearConfig(a.config, VISOES_DE_SISTEMA[atual.entity as EntidadeCrm] ?? ["todos"]) as unknown as Prisma.InputJsonValue;
  }
  if (a.posicao !== undefined) {
    const p = Number(a.posicao);
    if (!Number.isFinite(p)) throw new ErroDeVisao("Posição inválida.", 400, "posicao_invalida");
    data.position = p;
  }
  // Sempre preso ao contrato, mesmo depois da leitura (defesa em profundidade).
  const r = await prisma.savedView.updateMany({ where: { id, orgId: ctx.orgId }, data: data as Prisma.SavedViewUpdateManyMutationInput });
  if (r.count === 0) throw new ErroDeVisao("Visão não encontrada.", 404, "nao_encontrada");
  const l = await prisma.savedView.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!l) throw new ErroDeVisao("Visão não encontrada.", 404, "nao_encontrada");
  return paraVisao(l, q, await nomesDosDonos([l.ownerId]));
}

export async function apagarVisao(ctx: Ctx, id: string): Promise<void> {
  if (!(await visoesAtivadas())) throw INDISPONIVEL();
  const q = await quemOlha(ctx);
  const atual = await lerVisivel(ctx, q, id);
  if (!podeMexer(atual, q)) throw new ErroDeVisao("Só o dono (ou quem administra o contrato) apaga esta visão.", 403, "sem_permissao");
  await prisma.$transaction([
    prisma.savedView.deleteMany({ where: { id, orgId: ctx.orgId } }),
    // Quem tinha ela como padrão volta para a padrão de sistema.
    prisma.savedViewDefault.deleteMany({ where: { orgId: ctx.orgId, viewKey: id } }),
  ]);
}

/** Visão padrão da pessoa nesta lista: id de sistema ou de salva que ela enxerga. */
export async function definirPadrao(ctx: Ctx, entidade: EntidadeCrm, viewKey: unknown): Promise<string> {
  if (!(await visoesAtivadas())) throw INDISPONIVEL();
  const chave = typeof viewKey === "string" ? viewKey.trim().slice(0, 64) : "";
  if (!chave) throw new ErroDeVisao("Escolha a visão.", 400, "visao_obrigatoria");
  if (!VISOES_DE_SISTEMA[entidade].includes(chave)) {
    const l = await lerVisivel(ctx, await quemOlha(ctx), chave);
    if (l.entity !== entidade) throw new ErroDeVisao("Visão não encontrada.", 404, "nao_encontrada");
  }
  await prisma.savedViewDefault.upsert({
    where: { orgId_userId_entity: { orgId: ctx.orgId, userId: ctx.userId, entity: entidade } },
    create: { orgId: ctx.orgId, userId: ctx.userId, entity: entidade, viewKey: chave },
    update: { viewKey: chave },
  });
  return chave;
}
