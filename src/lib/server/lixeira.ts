import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { tabelaAusente } from "@/lib/server/layout-do-cartao";
import {
  expiraEm,
  paraJson,
  planejarContato,
  planejarEmpresa,
  planejarNegocio,
  resumoDaFoto,
  type EntidadeDaLixeira,
  type Externo,
  type Foto,
  type FotoDaEmpresa,
  type FotoDoContato,
  type FotoDoNegocio,
  type Linha,
} from "@/lib/lixeira";

// ---------------------------------------------------------------------------
// Lixeira de 30 dias (decisão B: "foto", não soft delete).
//
// Apagar continua sendo DELETE de verdade — listas, busca, dashboard,
// exportação, API v1, filtros, fluxos, dedupe, sequências e disparos não
// precisam aprender a esconder registro apagado. Antes do DELETE, na mesma
// transação, grava em eva_studio_trash o registro e tudo o que a cascata do
// banco leva junto (ver onDelete: Cascade de Deal/Contact no schema) e a
// lápide em eva_studio_deleted_records (API v1 /deleted). Restaurar recria
// tudo com os mesmos ids, também numa transação, e remove a lápide.
//
// Tabelas opcionais (SQL ainda não aplicado) são sondadas FORA da transação:
// dentro dela, um erro de tabela ausente abortaria tudo no Postgres.
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

export class ErroDaLixeira extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo: string
  ) {
    super(message);
  }
}

// ── Sondagem das tabelas opcionais ─────────────────────────────────────────

const SONDAS = {
  lixeira: () => prisma.trashItem.findFirst({ select: { id: true } }),
  lapides: () => prisma.deletedRecord.findFirst({ select: { id: true } }),
  externos: () => prisma.externalRef.findFirst({ select: { id: true } }),
  eventos: () => prisma.dealStageEvent.findFirst({ select: { id: true } }),
  flagDoEvento: () => prisma.dealStageEvent.findFirst({ select: { ignorouObrigatorios: true } }),
  itens: () => prisma.dealItem.findFirst({ select: { id: true } }),
  valorManual: () => prisma.dealAmountSetting.findFirst({ select: { dealId: true } }),
  perda: () => prisma.dealLoss.findFirst({ select: { dealId: true } }),
  atividade: () => prisma.dealActivity.findFirst({ select: { dealId: true } }),
} as const;
type Opcional = keyof typeof SONDAS;
export type Disponiveis = Record<Opcional, boolean>;

// Tabela que passou a existir não deixa de existir: só o "sim" fica guardado.
const confirmadas = new Set<Opcional>();

/** Só para os testes. */
export function _esquecerSondagens() {
  confirmadas.clear();
}

async function existe(nome: Opcional): Promise<boolean> {
  if (confirmadas.has(nome)) return true;
  try {
    await SONDAS[nome]();
    confirmadas.add(nome);
    return true;
  } catch (e) {
    if (tabelaAusente(e)) return false;
    throw e;
  }
}

async function disponiveis(): Promise<Disponiveis> {
  const nomes = Object.keys(SONDAS) as Opcional[];
  const r = await Promise.all(nomes.map(existe));
  return Object.fromEntries(nomes.map((n, i) => [n, r[i]])) as Disponiveis;
}

/** A lixeira está ativada no banco (SQL 2026-10-20-lixeira aplicado)? */
export function lixeiraDisponivel(): Promise<boolean> {
  return existe("lixeira");
}

export const AVISO_SEM_LIXEIRA =
  "A lixeira ainda não está ativada neste contrato: o registro foi apagado de forma definitiva.";

// ── Foto ───────────────────────────────────────────────────────────────────

const json = <T>(v: T) => paraJson(v);

async function fotoDoNegocio(tx: Tx, orgId: string, id: string, d: Disponiveis): Promise<FotoDoNegocio | null> {
  const deal = await tx.deal.findFirst({
    where: { id, orgId },
    include: { stage: { select: { name: true } }, pipeline: { select: { name: true } }, company: { select: { name: true } } },
  });
  if (!deal) return null;
  const { stage, pipeline, company, ...registro } = deal;
  const [contatos, tarefas, notas, eventos, itens, valorManual, perda, atividade, externos] = await Promise.all([
    tx.dealContact.findMany({ where: { dealId: id }, select: { contactId: true, role: true } }),
    tx.task.findMany({ where: { dealId: id } }),
    tx.note.findMany({ where: { dealId: id } }),
    d.eventos
      ? d.flagDoEvento
        ? tx.dealStageEvent.findMany({ where: { dealId: id } })
        : tx.dealStageEvent.findMany({
            where: { dealId: id },
            select: { id: true, orgId: true, dealId: true, pipelineId: true, fromStageId: true, toStageId: true, origem: true, at: true },
          })
      : Promise.resolve([]),
    d.itens ? tx.dealItem.findMany({ where: { dealId: id } }) : Promise.resolve([]),
    d.valorManual ? tx.dealAmountSetting.findUnique({ where: { dealId: id } }) : Promise.resolve(null),
    d.perda ? tx.dealLoss.findUnique({ where: { dealId: id } }) : Promise.resolve(null),
    d.atividade ? tx.dealActivity.findUnique({ where: { dealId: id } }) : Promise.resolve(null),
    d.externos ? tx.externalRef.findMany({ where: { orgId, entity: "deal", entityId: id }, select: { source: true, externalId: true } }) : Promise.resolve([]),
  ]);
  return json({
    versao: 1,
    entidade: "deal",
    registro,
    contexto: { etapa: stage?.name ?? "", funil: pipeline?.name ?? "", empresa: company?.name ?? "" },
    contatos,
    tarefas,
    notas,
    eventos,
    itens,
    valorManual,
    perda,
    atividade,
    externos,
  }) as FotoDoNegocio;
}

async function fotoDoContato(tx: Tx, orgId: string, id: string, d: Disponiveis): Promise<FotoDoContato | null> {
  const contato = await tx.contact.findFirst({ where: { id, orgId }, include: { company: { select: { name: true } } } });
  if (!contato) return null;
  const { company, ...registro } = contato;
  const [canais, etiquetas, negocios, tarefas, notas, inscricoes, conversas, externos] = await Promise.all([
    tx.contactChannel.findMany({ where: { contactId: id } }),
    tx.contactTag.findMany({ where: { contactId: id }, select: { tagId: true, addedAt: true } }),
    tx.dealContact.findMany({ where: { contactId: id }, select: { dealId: true, role: true } }),
    tx.task.findMany({ where: { contactId: id } }),
    tx.note.findMany({ where: { contactId: id } }),
    tx.sequenceEnrollment.findMany({ where: { contactId: id } }),
    tx.conversation.findMany({ where: { contactRecordId: id }, select: { id: true } }),
    d.externos ? tx.externalRef.findMany({ where: { orgId, entity: "contact", entityId: id }, select: { source: true, externalId: true } }) : Promise.resolve([]),
  ]);
  return json({
    versao: 1,
    entidade: "contact",
    registro,
    contexto: { empresa: company?.name ?? "" },
    canais,
    etiquetas,
    negocios,
    tarefas,
    notas,
    inscricoes,
    conversas: conversas.map((c) => c.id),
    externos,
  }) as FotoDoContato;
}

async function fotoDaEmpresa(tx: Tx, orgId: string, id: string, d: Disponiveis): Promise<FotoDaEmpresa | null> {
  const registro = await tx.company.findFirst({ where: { id, orgId } });
  if (!registro) return null;
  const [contatos, negocios, externos] = await Promise.all([
    tx.contact.findMany({ where: { companyId: id, orgId }, select: { id: true } }),
    tx.deal.findMany({ where: { companyId: id, orgId }, select: { id: true } }),
    d.externos ? tx.externalRef.findMany({ where: { orgId, entity: "company", entityId: id }, select: { source: true, externalId: true } }) : Promise.resolve([]),
  ]);
  return json({
    versao: 1,
    entidade: "company",
    registro,
    contatos: contatos.map((c) => c.id),
    negocios: negocios.map((n) => n.id),
    externos,
  }) as FotoDaEmpresa;
}

/** A foto de um registro com tudo o que a cascata levaria (null = não existe nesta org). */
export function fotografar(tx: Tx, orgId: string, entidade: EntidadeDaLixeira, id: string, d: Disponiveis): Promise<Foto | null> {
  if (entidade === "deal") return fotoDoNegocio(tx, orgId, id, d);
  if (entidade === "contact") return fotoDoContato(tx, orgId, id, d);
  return fotoDaEmpresa(tx, orgId, id, d);
}

function nomeDaFoto(foto: Foto): string {
  const r = foto.registro;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (foto.entidade === "contact") return s(r.name) || s(r.phone) || s(r.email) || "Sem nome";
  return s(r.name) || "Sem nome";
}

// ── Apagar ─────────────────────────────────────────────────────────────────

export interface QuemApagou {
  id: string | null;
  nome: string;
}

export type ResultadoDaExclusao =
  | { lixeira: true; trashId: string; expiresAt: Date; aviso: null }
  | { lixeira: false; trashId: null; expiresAt: null; aviso: string };

async function apagarRegistro(tx: Tx, entidade: EntidadeDaLixeira, id: string) {
  // Cascata do banco: tarefas, notas, histórico, itens, vínculos, canais...
  if (entidade === "deal") await tx.deal.delete({ where: { id } });
  else if (entidade === "contact") await tx.contact.delete({ where: { id } });
  else await tx.company.delete({ where: { id } });
}

/** Lápide da API v1 (/deleted) com o id externo principal, e solta os ids externos. */
async function gravarLapide(tx: Tx, orgId: string, entidade: EntidadeDaLixeira, id: string, externos: Externo[], d: Disponiveis) {
  if (d.lapides) {
    const principal = externos.find((e) => e.source === "api") ?? externos[0];
    await tx.deletedRecord.create({ data: { orgId, entity: entidade, entityId: id, externalId: principal?.externalId ?? "" } });
  }
  if (d.externos) await tx.externalRef.deleteMany({ where: { orgId, entity: entidade, entityId: id } });
}

/**
 * Apaga mandando para a lixeira. Sem a tabela da lixeira no banco:
 * `seIndisponivel: "recusar"` lança 409 `lixeira_indisponivel` (a tela pede
 * confirmação e manda de novo com "apagar"); "apagar" apaga de vez e devolve
 * o aviso. Registro de outra org (ou que não existe): 404.
 */
export async function apagarComLixeira(input: {
  orgId: string;
  entidade: EntidadeDaLixeira;
  id: string;
  quem: QuemApagou;
  seIndisponivel: "recusar" | "apagar";
  agora?: Date;
}): Promise<ResultadoDaExclusao> {
  const { orgId, entidade, id, quem } = input;
  const d = await disponiveis();
  if (!d.lixeira && input.seIndisponivel === "recusar") {
    throw new ErroDaLixeira(
      "A lixeira ainda não está ativada neste contrato: apagar agora é definitivo.",
      409,
      "lixeira_indisponivel"
    );
  }
  const agora = input.agora ?? new Date();
  const expiresAt = expiraEm(agora);

  return prisma.$transaction(async (tx) => {
    const foto = await fotografar(tx, orgId, entidade, id, d);
    if (!foto) throw new ErroDaLixeira("Registro não encontrado.", 404, "nao_encontrado");

    let trashId: string | null = null;
    if (d.lixeira) {
      const item = await tx.trashItem.create({
        data: {
          orgId,
          entity: entidade,
          entityId: id,
          name: nomeDaFoto(foto).slice(0, 300),
          detail: resumoDaFoto(foto).slice(0, 300),
          ownerId: typeof foto.registro.ownerId === "string" ? foto.registro.ownerId : null,
          snapshot: foto as unknown as Prisma.InputJsonValue,
          deletedById: quem.id,
          deletedByName: quem.nome.slice(0, 200),
          deletedAt: agora,
          expiresAt,
        },
        select: { id: true },
      });
      trashId = item.id;
    }
    await gravarLapide(tx, orgId, entidade, id, foto.externos, d);
    await apagarRegistro(tx, entidade, id);

    return trashId
      ? { lixeira: true as const, trashId, expiresAt, aviso: null }
      : { lixeira: false as const, trashId: null, expiresAt: null, aviso: AVISO_SEM_LIXEIRA };
  });
}

// ── Ler, listar, limpar ────────────────────────────────────────────────────

export interface ItemDaLixeira {
  id: string;
  orgId: string;
  entity: string;
  entityId: string;
  name: string;
  detail: string;
  ownerId: string | null;
  deletedById: string | null;
  deletedByName: string;
  deletedAt: Date;
  expiresAt: Date;
}

const SEM_FOTO = {
  id: true,
  orgId: true,
  entity: true,
  entityId: true,
  name: true,
  detail: true,
  ownerId: true,
  deletedById: true,
  deletedByName: true,
  deletedAt: true,
  expiresAt: true,
} as const;

/** Item da lixeira desta org (null = não existe aqui; outra org nunca enxerga). */
export async function lerItemDaLixeira(orgId: string, id: string): Promise<ItemDaLixeira | null> {
  if (!(await lixeiraDisponivel())) return null;
  return prisma.trashItem.findFirst({ where: { id, orgId }, select: SEM_FOTO });
}

/** Última foto de um registro na lixeira (para o "restore" da API v1 pelo id do registro). */
export async function lerItemPeloRegistro(orgId: string, entidade: EntidadeDaLixeira, entityId: string): Promise<ItemDaLixeira | null> {
  if (!(await lixeiraDisponivel())) return null;
  return prisma.trashItem.findFirst({ where: { orgId, entity: entidade, entityId }, orderBy: { deletedAt: "desc" }, select: SEM_FOTO });
}

export interface FiltroDaLixeira {
  /** Por entidade que a pessoa pode ver: null = todos; lista = donos visíveis (escopo). */
  entidades: Partial<Record<EntidadeDaLixeira, string[] | null>>;
  /** Quem pede: sempre vê o que ela mesma apagou (mesmo fora do escopo). */
  userId: string;
  busca?: string;
  tipo?: EntidadeDaLixeira | null;
  agora?: Date;
  limite?: number;
}

export async function listarLixeira(orgId: string, f: FiltroDaLixeira): Promise<{ disponivel: boolean; itens: ItemDaLixeira[] }> {
  if (!(await lixeiraDisponivel())) return { disponivel: false, itens: [] };
  const ou: Prisma.TrashItemWhereInput[] = [];
  for (const [entidade, donos] of Object.entries(f.entidades) as [EntidadeDaLixeira, string[] | null | undefined][]) {
    if (donos === undefined) continue;
    if (f.tipo && f.tipo !== entidade) continue;
    ou.push(donos === null ? { entity: entidade } : { entity: entidade, OR: [{ ownerId: { in: donos } }, { deletedById: f.userId }] });
  }
  if (ou.length === 0) return { disponivel: true, itens: [] };
  const busca = f.busca?.trim();
  const itens = await prisma.trashItem.findMany({
    where: {
      orgId,
      expiresAt: { gt: f.agora ?? new Date() },
      OR: ou,
      ...(busca ? { name: { contains: busca, mode: "insensitive" } } : {}),
    },
    orderBy: { deletedAt: "desc" },
    take: f.limite ?? 200,
    select: SEM_FOTO,
  });
  return { disponivel: true, itens };
}

/** Relógio: apaga para sempre o que passou dos 30 dias. Sem a tabela, 0. */
export async function limparLixeiraVencida(agora: Date = new Date()): Promise<number> {
  if (!(await lixeiraDisponivel())) return 0;
  const r = await prisma.trashItem.deleteMany({ where: { expiresAt: { lte: agora } } });
  return r.count;
}

/** "Apagar para sempre": a foto some (o registro já tinha sumido). */
export async function apagarParaSempre(orgId: string, id: string): Promise<boolean> {
  if (!(await lixeiraDisponivel())) return false;
  const r = await prisma.trashItem.deleteMany({ where: { id, orgId } });
  return r.count > 0;
}

// ── Restaurar ──────────────────────────────────────────────────────────────

export interface ResultadoDaRestauracao {
  entidade: EntidadeDaLixeira;
  entityId: string;
  nome: string;
  avisos: string[];
}

const ids = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === "string" && !!x))];
const conjunto = (linhas: { id: string }[]) => new Set(linhas.map((l) => l.id));

async function externosOcupados(orgId: string, entidade: EntidadeDaLixeira, externos: Externo[], d: Disponiveis): Promise<Set<string>> {
  if (!d.externos || externos.length === 0) return new Set();
  const r = await prisma.externalRef.findMany({
    where: { orgId, entity: entidade, OR: externos.map((e) => ({ source: e.source, externalId: e.externalId })) },
    select: { source: true, externalId: true },
  });
  return new Set(r.map((e) => `${e.source}|${e.externalId}`));
}

async function pessoasExistentes(lista: unknown[]): Promise<Set<string>> {
  const pedidas = ids(lista);
  if (!pedidas.length) return new Set();
  return conjunto(await prisma.profile.findMany({ where: { id: { in: pedidas } }, select: { id: true } }));
}

async function recriarExternos(tx: Tx, orgId: string, entidade: EntidadeDaLixeira, entityId: string, externos: Externo[], d: Disponiveis) {
  if (d.externos && externos.length) {
    await tx.externalRef.createMany({
      data: externos.map((e) => ({ orgId, entity: entidade, source: e.source, externalId: e.externalId, entityId })),
      skipDuplicates: true,
    });
  }
  if (d.lapides) await tx.deletedRecord.deleteMany({ where: { orgId, entity: entidade, entityId } });
}

async function restaurarNegocio(orgId: string, trashId: string, foto: FotoDoNegocio, d: Disponiveis, agora: Date): Promise<string[]> {
  const r = foto.registro;
  const etapaOriginal = await prisma.pipelineStage.findFirst({
    where: { id: String(r.stageId), pipelineId: String(r.pipelineId), pipeline: { orgId } },
    select: { id: true, pipelineId: true, type: true, probability: true },
  });
  const etapaDeEntrada = etapaOriginal
    ? null
    : ((await prisma.pipelineStage.findFirst({
        where: { pipelineId: String(r.pipelineId), type: "open", pipeline: { orgId } },
        orderBy: { position: "asc" },
        select: { id: true, pipelineId: true, type: true, probability: true },
      })) ??
      (await prisma.pipelineStage.findFirst({
        where: { type: "open", pipeline: { orgId } },
        orderBy: [{ pipeline: { position: "asc" } }, { pipeline: { createdAt: "asc" } }, { position: "asc" }],
        select: { id: true, pipelineId: true, type: true, probability: true },
      })));
  const contatosPedidos = ids([...foto.contatos.map((c) => c.contactId), ...foto.tarefas.map((t) => t.contactId), ...foto.notas.map((n) => n.contactId)]);
  const produtosPedidos = ids(foto.itens.map((i) => i.productId));
  const [empresas, pessoas, contatos, produtos, ocupados] = await Promise.all([
    typeof r.companyId === "string" && r.companyId
      ? prisma.company.findMany({ where: { id: r.companyId, orgId }, select: { id: true } }).then(conjunto)
      : Promise.resolve(new Set<string>()),
    pessoasExistentes([r.ownerId, ...foto.tarefas.map((t) => t.assignedToId), ...foto.notas.map((n) => n.authorId)]),
    contatosPedidos.length
      ? prisma.contact.findMany({ where: { id: { in: contatosPedidos }, orgId }, select: { id: true } }).then(conjunto)
      : Promise.resolve(new Set<string>()),
    produtosPedidos.length && d.itens
      ? prisma.product.findMany({ where: { id: { in: produtosPedidos }, orgId }, select: { id: true } }).then(conjunto)
      : Promise.resolve(new Set<string>()),
    externosOcupados(orgId, "deal", foto.externos, d),
  ]);

  const plano = planejarNegocio(foto, { etapaOriginal, etapaDeEntrada, empresas, pessoas, contatos, produtos, externosOcupados: ocupados, agora });
  if (!plano.ok) throw new ErroDaLixeira(plano.erro, 409, "sem_etapa_aberta");
  const dealId = String(r.id);

  await prisma.$transaction(async (tx) => {
    await tx.deal.createMany({ data: [plano.registro as unknown as Prisma.DealCreateManyInput] });
    if (plano.contatos.length) {
      await tx.dealContact.createMany({ data: plano.contatos.map((c) => ({ dealId, contactId: c.contactId, role: c.role })), skipDuplicates: true });
    }
    if (plano.tarefas.length) await tx.task.createMany({ data: plano.tarefas as unknown as Prisma.TaskCreateManyInput[] });
    if (plano.notas.length) await tx.note.createMany({ data: plano.notas as unknown as Prisma.NoteCreateManyInput[] });
    if (d.eventos) {
      const eventos: Linha[] = plano.eventos.map((e) => {
        if (d.flagDoEvento) return e;
        // Foto tirada com a coluna, restaurada sem ela: a flag se perde, o evento não.
        const { ignorouObrigatorios: _ignorada, ...resto } = e;
        void _ignorada;
        return resto;
      });
      if (plano.eventoNovo) {
        eventos.push({ orgId, dealId, ...plano.eventoNovo, origem: "usuario", at: agora.toISOString() });
      }
      if (eventos.length) await tx.dealStageEvent.createMany({ data: eventos as unknown as Prisma.DealStageEventCreateManyInput[] });
    }
    if (d.itens && plano.itens.length) await tx.dealItem.createMany({ data: plano.itens as unknown as Prisma.DealItemCreateManyInput[] });
    if (d.valorManual && plano.valorManual) {
      await tx.dealAmountSetting.createMany({ data: [plano.valorManual as unknown as Prisma.DealAmountSettingCreateManyInput], skipDuplicates: true });
    }
    if (d.perda && plano.perda) await tx.dealLoss.createMany({ data: [plano.perda as unknown as Prisma.DealLossCreateManyInput], skipDuplicates: true });
    if (d.atividade && plano.atividade) {
      await tx.dealActivity.createMany({ data: [plano.atividade as unknown as Prisma.DealActivityCreateManyInput], skipDuplicates: true });
    }
    await recriarExternos(tx, orgId, "deal", dealId, plano.externos, d);
    await tx.trashItem.delete({ where: { id: trashId } });
  });
  return plano.avisos;
}

async function restaurarContato(orgId: string, trashId: string, foto: FotoDoContato, d: Disponiveis): Promise<string[]> {
  const r = foto.registro;
  const contactId = String(r.id);
  const negociosPedidos = ids([...foto.negocios.map((n) => n.dealId), ...foto.tarefas.map((t) => t.dealId), ...foto.notas.map((n) => n.dealId)]);
  const tagsPedidas = ids(foto.etiquetas.map((t) => t.tagId));
  const seqPedidas = ids(foto.inscricoes.map((i) => i.sequenceId));
  const agentesPedidos = ids(foto.canais.map((c) => c.agentId));
  const vazio = Promise.resolve(new Set<string>());
  const [empresas, pessoas, etiquetas, negocios, sequencias, agentes, canaisOcupados, conversasLivres, ocupados] = await Promise.all([
    typeof r.companyId === "string" && r.companyId
      ? prisma.company.findMany({ where: { id: r.companyId, orgId }, select: { id: true } }).then(conjunto)
      : vazio,
    pessoasExistentes([r.ownerId, ...foto.tarefas.map((t) => t.assignedToId), ...foto.notas.map((n) => n.authorId)]),
    tagsPedidas.length ? prisma.tag.findMany({ where: { id: { in: tagsPedidas }, orgId }, select: { id: true } }).then(conjunto) : vazio,
    negociosPedidos.length ? prisma.deal.findMany({ where: { id: { in: negociosPedidos }, orgId }, select: { id: true } }).then(conjunto) : vazio,
    seqPedidas.length ? prisma.sequence.findMany({ where: { id: { in: seqPedidas }, agent: { orgId } }, select: { id: true } }).then(conjunto) : vazio,
    agentesPedidos.length ? prisma.agent.findMany({ where: { id: { in: agentesPedidos }, orgId }, select: { id: true } }).then(conjunto) : vazio,
    foto.canais.length
      ? prisma.contactChannel
          .findMany({
            where: { OR: foto.canais.map((c) => ({ agentId: String(c.agentId), channel: String(c.channel), externalId: String(c.externalId) })) },
            select: { agentId: true, channel: true, externalId: true },
          })
          .then((xs) => new Set(xs.map((c) => `${c.agentId}|${c.channel}|${c.externalId}`)))
      : vazio,
    foto.conversas.length
      ? prisma.conversation
          .findMany({ where: { id: { in: foto.conversas }, contactRecordId: null, agent: { orgId } }, select: { id: true } })
          .then(conjunto)
      : vazio,
    externosOcupados(orgId, "contact", foto.externos, d),
  ]);

  const plano = planejarContato(foto, { empresas, pessoas, etiquetas, negocios, sequencias, agentes, canaisOcupados, conversasLivres, externosOcupados: ocupados });

  await prisma.$transaction(async (tx) => {
    await tx.contact.createMany({ data: [plano.registro as unknown as Prisma.ContactCreateManyInput] });
    if (plano.canais.length) await tx.contactChannel.createMany({ data: plano.canais as unknown as Prisma.ContactChannelCreateManyInput[], skipDuplicates: true });
    if (plano.etiquetas.length) {
      await tx.contactTag.createMany({
        data: plano.etiquetas.map((t) => ({ contactId, tagId: t.tagId, addedAt: t.addedAt as string })),
        skipDuplicates: true,
      });
    }
    if (plano.negocios.length) {
      await tx.dealContact.createMany({ data: plano.negocios.map((n) => ({ dealId: n.dealId, contactId, role: n.role })), skipDuplicates: true });
    }
    if (plano.tarefas.length) await tx.task.createMany({ data: plano.tarefas as unknown as Prisma.TaskCreateManyInput[] });
    if (plano.notas.length) await tx.note.createMany({ data: plano.notas as unknown as Prisma.NoteCreateManyInput[] });
    if (plano.inscricoes.length) {
      await tx.sequenceEnrollment.createMany({ data: plano.inscricoes as unknown as Prisma.SequenceEnrollmentCreateManyInput[], skipDuplicates: true });
    }
    if (plano.conversas.length) {
      await tx.conversation.updateMany({ where: { id: { in: plano.conversas }, contactRecordId: null }, data: { contactRecordId: contactId } });
    }
    await recriarExternos(tx, orgId, "contact", contactId, plano.externos, d);
    await tx.trashItem.delete({ where: { id: trashId } });
  });
  return plano.avisos;
}

async function restaurarEmpresa(orgId: string, trashId: string, foto: FotoDaEmpresa, d: Disponiveis): Promise<string[]> {
  const r = foto.registro;
  const companyId = String(r.id);
  const vazio = Promise.resolve(new Set<string>());
  const [pessoas, contatosLivres, negociosLivres, ocupados] = await Promise.all([
    pessoasExistentes([r.ownerId]),
    foto.contatos.length
      ? prisma.contact.findMany({ where: { id: { in: foto.contatos }, orgId, companyId: null }, select: { id: true } }).then(conjunto)
      : vazio,
    foto.negocios.length
      ? prisma.deal.findMany({ where: { id: { in: foto.negocios }, orgId, companyId: null }, select: { id: true } }).then(conjunto)
      : vazio,
    externosOcupados(orgId, "company", foto.externos, d),
  ]);
  const plano = planejarEmpresa(foto, { pessoas, contatosLivres, negociosLivres, externosOcupados: ocupados });

  await prisma.$transaction(async (tx) => {
    await tx.company.createMany({ data: [plano.registro as unknown as Prisma.CompanyCreateManyInput] });
    if (plano.contatos.length) {
      await tx.contact.updateMany({ where: { id: { in: plano.contatos }, orgId, companyId: null }, data: { companyId } });
    }
    if (plano.negocios.length) {
      await tx.deal.updateMany({ where: { id: { in: plano.negocios }, orgId, companyId: null }, data: { companyId } });
    }
    await recriarExternos(tx, orgId, "company", companyId, plano.externos, d);
    await tx.trashItem.delete({ where: { id: trashId } });
  });
  return plano.avisos;
}

/**
 * Restaura um item da lixeira desta org (quem chama já conferiu a permissão
 * com lerItemDaLixeira). Vencido: 410. Registro com o mesmo id já existe
 * (restaurado em outra aba): 409.
 */
export async function restaurarDaLixeira(orgId: string, trashId: string, agora: Date = new Date()): Promise<ResultadoDaRestauracao> {
  const d = await disponiveis();
  if (!d.lixeira) throw new ErroDaLixeira("A lixeira ainda não está ativada neste contrato.", 409, "lixeira_indisponivel");
  const item = await prisma.trashItem.findFirst({ where: { id: trashId, orgId } });
  if (!item) throw new ErroDaLixeira("Item não encontrado na lixeira.", 404, "nao_encontrado");
  if (item.expiresAt.getTime() <= agora.getTime()) {
    throw new ErroDaLixeira("Este item passou dos 30 dias na lixeira e não pode mais ser restaurado.", 410, "expirado");
  }
  const foto = item.snapshot as unknown as Foto;
  const entidade = item.entity as EntidadeDaLixeira;
  const jaExiste =
    entidade === "deal"
      ? await prisma.deal.findUnique({ where: { id: item.entityId }, select: { id: true } })
      : entidade === "contact"
        ? await prisma.contact.findUnique({ where: { id: item.entityId }, select: { id: true } })
        : await prisma.company.findUnique({ where: { id: item.entityId }, select: { id: true } });
  if (jaExiste) throw new ErroDaLixeira("Este registro já foi restaurado.", 409, "ja_restaurado");

  let avisos: string[];
  try {
    if (foto.entidade === "deal") avisos = await restaurarNegocio(orgId, item.id, foto, d, agora);
    else if (foto.entidade === "contact") avisos = await restaurarContato(orgId, item.id, foto, d);
    else avisos = await restaurarEmpresa(orgId, item.id, foto, d);
  } catch (e) {
    if (e instanceof ErroDaLixeira) throw e;
    // Algo mudou entre a conferência e a escrita (vínculo apagado agora há
    // pouco): a transação desfez tudo, e tentar de novo resolve.
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2002")) {
      throw new ErroDaLixeira("Algo mudou enquanto restaurava. Tente de novo.", 409, "conflito");
    }
    throw e;
  }
  return { entidade, entityId: item.entityId, nome: item.name, avisos };
}
