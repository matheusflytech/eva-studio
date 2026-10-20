import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionContext } from "@/lib/server/permissions";
import { ctxPode } from "@/lib/server/permissions";
import { donosVisiveis, filtroDeEscopo } from "@/lib/server/escopo-dados";
import { idsDoFiltro } from "@/lib/server/filtro-crm";
import { conferirReferencias } from "@/lib/server/api-validacao";
import { ErroDaMudanca, ErroDeCrm, moveDealStage } from "@/lib/server/crm";
import { registrarMudancasEmLote } from "@/lib/server/stage-events";
import { ErroDaLixeira, apagarComLixeira, lerItemDaLixeira, lixeiraDisponivel, restaurarDaLixeira } from "@/lib/server/lixeira";
import { nomeDeQuem, podeVerItem } from "@/lib/server/lixeira-http";
import { enrollContact, enrollContactByTag } from "@/lib/server/sequences";
import type { FiltroDeConsulta } from "@/lib/consulta";
import type { EntidadeCrm } from "@/lib/filtro-crm";
import {
  LIMITE_DO_LOTE,
  PERMISSAO_DA_ACAO,
  agruparCaminhos,
  emBlocos,
  type AcaoDeContato,
  type AcaoDeNegocio,
  type FalhaDoItem,
  type PedidoDeLote,
  type ResultadoDoLote,
} from "@/lib/lote/lote";

// ---------------------------------------------------------------------------
// Ações em massa de Contatos e Negócios (fase L5).
//
// Sempre dentro do contrato ativo e do escopo de dados do papel:
//   - por filtro ("todos os N"): idsDoFiltro refaz a busca no servidor, com o
//     mesmo motor da lista, até LIMITE_DO_LOTE (passou = `truncado`);
//   - por ids: conferidos contra { orgId, escopo } — o que não bate é ignorado.
// Permissão granular por ação (PERMISSAO_DA_ACAO). Escritas simples (dono,
// etiqueta, arquivar) em transações de BLOCO_DO_LOTE; mudança de etapa e
// exclusão uma a uma pelo caminho de sempre (moveDealStage com as regras da
// etapa; apagarComLixeira com a foto), com o resultado por item.
// `simular` = prévia: nada é gravado.
// ---------------------------------------------------------------------------

type Ctx = Pick<SessionContext, "userId" | "orgId" | "role" | "permissoes" | "escopo">;

export class ErroDoLote extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409,
    public codigo: string
  ) {
    super(message);
  }
}

const vazio = (acao: ResultadoDoLote["acao"], simulado: boolean): ResultadoDoLote => ({
  acao,
  simulado,
  total: 0,
  ok: 0,
  ignorados: 0,
  falhas: [],
  truncado: false,
  avisos: [],
});

/** Roda `fn` em cada item, no máximo `n` ao mesmo tempo, na ordem. */
async function emParalelo<T>(itens: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) await fn(itens[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
}

const texto = (v: unknown, max = 64) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Confere a permissão da ação; 403 com a mensagem de sempre. */
export function conferirPermissao(ctx: Ctx, entidade: EntidadeCrm, acao: string): void {
  const tabela = PERMISSAO_DA_ACAO[entidade] as Record<string, Parameters<typeof ctxPode>[1]>;
  const p = tabela[acao];
  if (!p || !ctxPode(ctx, p)) throw new ErroDoLote("Seu perfil não tem permissão para essa ação.", 403, "sem_permissao");
}

/** Ids do alvo: do filtro (refeito no servidor) ou da seleção (conferida). */
async function idsDoAlvo(ctx: Ctx, entidade: EntidadeCrm, p: PedidoDeLote, r: ResultadoDoLote, incluirArquivados: boolean): Promise<string[]> {
  if (p.ids === null) {
    const extras: FiltroDeConsulta[] = entidade === "negocios" && p.pipelineId ? [{ campo: "funil", op: "qualquer", valores: [p.pipelineId] }] : [];
    const achados = await idsDoFiltro(ctx, entidade, p.filtro, LIMITE_DO_LOTE, { extras, incluirArquivados });
    r.truncado = achados.truncado;
    r.avisos.push(...achados.avisos);
    if (achados.truncado) r.avisos.push(`A seleção passou de ${LIMITE_DO_LOTE.toLocaleString("pt-BR")}: a ação vale só para os primeiros ${LIMITE_DO_LOTE.toLocaleString("pt-BR")}.`);
    return achados.ids;
  }
  const escopo = await filtroDeEscopo(ctx, entidade);
  const where = { id: { in: p.ids }, orgId: ctx.orgId, ...escopo };
  const linhas =
    entidade === "contatos"
      ? await prisma.contact.findMany({ where, select: { id: true } })
      : await prisma.deal.findMany({ where, select: { id: true } });
  const fora = p.ids.length - linhas.length;
  if (fora > 0) {
    r.ignorados += fora;
    r.avisos.push(`${fora.toLocaleString("pt-BR")} ${fora === 1 ? "registro ficou" : "registros ficaram"} de fora (não existe mais ou está fora do que você pode ver).`);
  }
  return linhas.map((l) => l.id);
}

/** Novo responsável: membro do contrato e, com escopo restrito, dentro dele. */
async function conferirResponsavel(ctx: Ctx, entidade: EntidadeCrm, responsavelId: string | null): Promise<void> {
  if (responsavelId) {
    const erroRef = await conferirReferencias(ctx.orgId, { ownerId: responsavelId });
    if (erroRef) throw new ErroDoLote(erroRef, 404, "responsavel_nao_encontrado");
  }
  const donos = await donosVisiveis(ctx, entidade);
  if (donos && (!responsavelId || !donos.includes(responsavelId))) {
    throw new ErroDoLote("Você não pode passar registros para fora do que você enxerga.", 403, "fora_do_escopo");
  }
}

// ── Responsável (contatos e negócios) ──────────────────────────────────────

async function atribuir(ctx: Ctx, entidade: EntidadeCrm, ids: string[], novo: string | null, r: ResultadoDoLote, simular: boolean) {
  await conferirResponsavel(ctx, entidade, novo);
  const linhas =
    entidade === "contatos"
      ? await prisma.contact.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, ownerId: true } })
      : await prisma.deal.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, ownerId: true } });
  const mudam = linhas.filter((l) => l.ownerId !== novo);
  r.total = linhas.length;
  r.ignorados += linhas.length - mudam.length;
  r.previa = { caminhos: [], mudam: mudam.length, jaEstavam: linhas.length - mudam.length };
  if (simular) {
    r.ok = mudam.length;
    return;
  }
  for (const bloco of emBlocos(mudam)) {
    const where = { id: { in: bloco.map((l) => l.id) }, orgId: ctx.orgId };
    const [u] = await prisma.$transaction([
      entidade === "contatos" ? prisma.contact.updateMany({ where, data: { ownerId: novo } }) : prisma.deal.updateMany({ where, data: { ownerId: novo } }),
    ]);
    r.ok += u.count;
  }
  if (mudam.length) r.desfazer = { acao: "restaurar_responsavel", parametros: { itens: mudam.map((l) => ({ id: l.id, responsavelId: l.ownerId })) } };
}

/** Desfazer do atribuir: cada registro volta para o dono de antes (mesmas checagens). */
async function restaurarResponsavel(ctx: Ctx, entidade: EntidadeCrm, bruto: unknown, r: ResultadoDoLote) {
  const itens = (Array.isArray(bruto) ? bruto : [])
    .slice(0, LIMITE_DO_LOTE)
    .map((x) => ({ id: texto((x as { id?: unknown })?.id), dono: texto((x as { responsavelId?: unknown })?.responsavelId) || null }))
    .filter((x) => x.id);
  if (!itens.length) throw new ErroDoLote("Nada para desfazer.", 400, "nada_para_desfazer");
  const porDono = new Map<string | null, string[]>();
  for (const x of itens) porDono.set(x.dono, [...(porDono.get(x.dono) ?? []), x.id]);
  const escopo = await filtroDeEscopo(ctx, entidade);
  for (const [dono, ids] of porDono) {
    await conferirResponsavel(ctx, entidade, dono);
    for (const bloco of emBlocos(ids)) {
      const where = { id: { in: bloco }, orgId: ctx.orgId, ...escopo };
      const [u] = await prisma.$transaction([
        entidade === "contatos" ? prisma.contact.updateMany({ where, data: { ownerId: dono } }) : prisma.deal.updateMany({ where, data: { ownerId: dono } }),
      ]);
      r.ok += u.count;
      r.ignorados += bloco.length - u.count;
    }
  }
  r.total = itens.length;
}

// ── Lixeira (contatos e negócios) ──────────────────────────────────────────

async function apagar(ctx: Ctx, entidade: EntidadeCrm, ids: string[], definitivo: boolean, r: ResultadoDoLote, simular: boolean) {
  const comLixeira = await lixeiraDisponivel();
  if (!comLixeira && !definitivo) {
    throw new ErroDoLote("A lixeira ainda não está ativada neste contrato: apagar agora é definitivo.", 409, "lixeira_indisponivel");
  }
  r.total = ids.length;
  if (simular) {
    r.ok = ids.length;
    if (!comLixeira) r.avisos.push("Sem a lixeira, apagar é definitivo e não tem Desfazer.");
    return;
  }
  const quem = { id: ctx.userId, nome: await nomeDeQuem(ctx.userId) };
  const nomes = await nomesDe(ctx, entidade, ids);
  const lixeira: string[] = [];
  await emParalelo(ids, 4, async (id) => {
    try {
      const x = await apagarComLixeira({ orgId: ctx.orgId, entidade: entidade === "contatos" ? "contact" : "deal", id, quem, seIndisponivel: definitivo ? "apagar" : "recusar" });
      r.ok++;
      if (x.lixeira) lixeira.push(x.trashId);
    } catch (e) {
      if (e instanceof ErroDaLixeira) r.falhas.push({ id, nome: nomes.get(id) ?? "", motivo: e.message, codigo: e.codigo });
      else throw e;
    }
  });
  if (lixeira.length) r.desfazer = { acao: "restaurar_lixeira", parametros: { trashIds: lixeira } };
  if (!comLixeira) r.avisos.push("A lixeira não está ativada: os registros foram apagados de vez.");
}

/** Desfazer do apagar: restaura cada item da lixeira (só os que a pessoa pode ver). */
async function restaurarLixeira(ctx: Ctx, entidade: EntidadeCrm, bruto: unknown, r: ResultadoDoLote) {
  const ids = [...new Set((Array.isArray(bruto) ? bruto : []).map((x) => texto(x)).filter(Boolean))].slice(0, LIMITE_DO_LOTE);
  if (!ids.length) throw new ErroDoLote("Nada para desfazer.", 400, "nada_para_desfazer");
  const tipo = entidade === "contatos" ? "contact" : "deal";
  r.total = ids.length;
  await emParalelo(ids, 4, async (trashId) => {
    const item = await lerItemDaLixeira(ctx.orgId, trashId);
    if (!item || item.entity !== tipo || !(await podeVerItem(ctx, item))) {
      r.falhas.push({ id: trashId, nome: item?.name ?? "", motivo: "Item não encontrado na lixeira.", codigo: "nao_encontrado" });
      return;
    }
    try {
      const x = await restaurarDaLixeira(ctx.orgId, trashId);
      r.ok++;
      r.avisos.push(...x.avisos.map((a) => `${x.nome}: ${a}`));
    } catch (e) {
      if (e instanceof ErroDaLixeira) r.falhas.push({ id: trashId, nome: item.name, motivo: e.message, codigo: e.codigo });
      else throw e;
    }
  });
}

async function nomesDe(ctx: Ctx, entidade: EntidadeCrm, ids: string[]): Promise<Map<string, string>> {
  if (entidade === "contatos") {
    const cs = await prisma.contact.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, name: true, email: true, phone: true } });
    return new Map(cs.map((c) => [c.id, c.name || c.email || c.phone || ""]));
  }
  const ds = await prisma.deal.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, name: true } });
  return new Map(ds.map((d) => [d.id, d.name]));
}

// ── Contatos: etiqueta e sequência ─────────────────────────────────────────

async function etiqueta(ctx: Ctx, ids: string[], par: Record<string, unknown>, r: ResultadoDoLote, simular: boolean) {
  const tagId = texto(par.tagId);
  const modo = par.modo === "remover" ? "remover" : par.modo === "adicionar" ? "adicionar" : null;
  if (!tagId || !modo) throw new ErroDoLote("Escolha a etiqueta e se é para adicionar ou remover.", 400, "parametros_invalidos");
  const tag = await prisma.tag.findFirst({ where: { id: tagId, orgId: ctx.orgId }, select: { id: true } });
  if (!tag) throw new ErroDoLote("Etiqueta não encontrada.", 404, "etiqueta_nao_encontrada");
  const ja = new Set(
    (await prisma.contactTag.findMany({ where: { tagId, contactId: { in: ids } }, select: { contactId: true } })).map((x) => x.contactId)
  );
  const mudam = modo === "adicionar" ? ids.filter((id) => !ja.has(id)) : ids.filter((id) => ja.has(id));
  r.total = ids.length;
  r.ignorados += ids.length - mudam.length;
  r.previa = { caminhos: [], mudam: mudam.length, jaEstavam: ids.length - mudam.length };
  if (simular) {
    r.ok = mudam.length;
    return;
  }
  for (const bloco of emBlocos(mudam)) {
    const [x] = await prisma.$transaction([
      modo === "adicionar"
        ? prisma.contactTag.createMany({ data: bloco.map((contactId) => ({ contactId, tagId })), skipDuplicates: true })
        : prisma.contactTag.deleteMany({ where: { tagId, contactId: { in: bloco } } }),
    ]);
    r.ok += x.count;
  }
  // Etiqueta que é gatilho de sequência inscreve (a mesma regra do applyTag).
  if (modo === "adicionar" && mudam.length) {
    const gatilho = await prisma.sequence.count({ where: { active: true, trigger: "tag", triggerTagId: tagId } });
    if (gatilho > 0) await emParalelo(mudam, 4, (id) => enrollContactByTag(id, tagId));
  }
  if (mudam.length) r.desfazer = { acao: "etiqueta", ids: mudam, parametros: { tagId, modo: modo === "adicionar" ? "remover" : "adicionar" } };
}

async function sequencia(ctx: Ctx, ids: string[], par: Record<string, unknown>, r: ResultadoDoLote, simular: boolean) {
  const sequenceId = texto(par.sequenceId);
  if (!sequenceId) throw new ErroDoLote("Escolha a sequência.", 400, "parametros_invalidos");
  const seq = await prisma.sequence.findFirst({ where: { id: sequenceId, agent: { orgId: ctx.orgId } }, select: { id: true, allowReentry: true } });
  if (!seq) throw new ErroDoLote("Sequência não encontrada.", 404, "sequencia_nao_encontrada");
  const [semOptIn, inscritos] = await Promise.all([
    prisma.contact.findMany({ where: { id: { in: ids }, orgId: ctx.orgId, optIn: false }, select: { id: true } }),
    seq.allowReentry ? Promise.resolve([]) : prisma.sequenceEnrollment.findMany({ where: { sequenceId, contactId: { in: ids } }, select: { contactId: true } }),
  ]);
  const fora = new Set([...semOptIn.map((c) => c.id), ...inscritos.map((e) => e.contactId)]);
  const entram = ids.filter((id) => !fora.has(id));
  r.total = ids.length;
  r.ignorados += ids.length - entram.length;
  if (semOptIn.length) r.avisos.push(`${semOptIn.length.toLocaleString("pt-BR")} não aceitam mensagens (opt-out) e não entram.`);
  if (simular) {
    r.ok = entram.length;
    return;
  }
  await emParalelo(entram, 4, async (id) => {
    if (await enrollContact(sequenceId, id)) r.ok++;
    else r.ignorados++;
  });
}

// ── Negócios: etapa, ganho/perdido, arquivar ───────────────────────────────

type EventoDeEtapa = { orgId: string; dealId: string; pipelineId: string; fromStageId: string | null; toStageId: string };

interface Movimento {
  id: string;
  /** Etapa alvo (por negócio: ganho/perdido dependem do funil dele). */
  para: { id: string; name: string } | null;
}

async function mover(
  ctx: Ctx,
  movimentos: Movimento[],
  opcoes: { perda?: { motivoId: string; nota: string }; reabrir?: boolean },
  r: ResultadoDoLote,
  simular: boolean
) {
  const ids = movimentos.map((m) => m.id);
  const deals = await prisma.deal.findMany({
    where: { id: { in: ids }, orgId: ctx.orgId },
    select: { id: true, name: true, stageId: true, stage: { select: { name: true } } },
  });
  const porId = new Map(deals.map((d) => [d.id, d]));
  r.total = deals.length;
  const caminhos: { de: string; para: string }[] = [];
  const antes: { id: string; stageId: string }[] = [];
  const eventos: EventoDeEtapa[] = [];

  await emParalelo(movimentos, 6, async (m) => {
    const d = porId.get(m.id);
    if (!d) return;
    if (!m.para) {
      r.falhas.push({ id: d.id, nome: d.name, motivo: "O funil deste negócio não tem essa etapa.", codigo: "sem_etapa" });
      return;
    }
    if (d.stageId === m.para.id) {
      r.ignorados++;
      return;
    }
    try {
      await moveDealStage(d.id, m.para.id, {
        origem: "usuario",
        simular,
        reabrir: opcoes.reabrir,
        perda: opcoes.perda,
        historicoEmLote: (e) => eventos.push(e),
      });
      r.ok++;
      caminhos.push({ de: d.stage.name, para: m.para.name });
      if (!simular) antes.push({ id: d.id, stageId: d.stageId });
    } catch (e) {
      if (e instanceof ErroDaMudanca) r.falhas.push({ id: d.id, nome: d.name, motivo: e.message, codigo: e.codigo, faltando: e.faltando.map((f) => ({ id: f.campo, rotulo: f.rotulo })) });
      else if (e instanceof ErroDeCrm) r.falhas.push({ id: d.id, nome: d.name, motivo: e.message, codigo: "erro" });
      else throw e;
    }
  });

  // Histórico de etapa em lote (origem "usuario"), em blocos.
  for (const bloco of emBlocos(eventos)) await registrarMudancasEmLote(bloco, "usuario");
  r.previa = { caminhos: agruparCaminhos(caminhos), mudam: r.ok, jaEstavam: r.ignorados };
  if (antes.length) r.desfazer = { acao: "restaurar_etapa", parametros: { itens: antes } };
}

async function etapaDoPedido(ctx: Ctx, stageId: string) {
  const s = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipeline: { orgId: ctx.orgId } }, select: { id: true, name: true } });
  if (!s) throw new ErroDoLote("Etapa não encontrada.", 404, "etapa_nao_encontrada");
  return s;
}

/** Etapa de ganho/perdido do funil de cada negócio. */
async function movimentosDeFechamento(ctx: Ctx, ids: string[], tipo: "won" | "lost"): Promise<Movimento[]> {
  const deals = await prisma.deal.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, pipelineId: true } });
  const etapas = await prisma.pipelineStage.findMany({
    where: { type: tipo, pipelineId: { in: [...new Set(deals.map((d) => d.pipelineId))] }, pipeline: { orgId: ctx.orgId } },
    orderBy: { position: "asc" },
    select: { id: true, name: true, pipelineId: true },
  });
  const porFunil = new Map<string, { id: string; name: string }>();
  for (const e of etapas) if (!porFunil.has(e.pipelineId)) porFunil.set(e.pipelineId, { id: e.id, name: e.name });
  return deals.map((d) => ({ id: d.id, para: porFunil.get(d.pipelineId) ?? null }));
}

async function arquivar(ctx: Ctx, ids: string[], arquivar: boolean, r: ResultadoDoLote, simular: boolean) {
  const linhas = await prisma.deal.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, select: { id: true, archivedAt: true } });
  const mudam = linhas.filter((l) => (arquivar ? !l.archivedAt : !!l.archivedAt)).map((l) => l.id);
  r.total = linhas.length;
  r.ignorados += linhas.length - mudam.length;
  r.previa = { caminhos: [], mudam: mudam.length, jaEstavam: linhas.length - mudam.length };
  if (simular) {
    r.ok = mudam.length;
    return;
  }
  for (const bloco of emBlocos(mudam)) {
    const [u] = await prisma.$transaction([
      prisma.deal.updateMany({ where: { id: { in: bloco }, orgId: ctx.orgId }, data: { archivedAt: arquivar ? new Date() : null } }),
    ]);
    r.ok += u.count;
  }
  if (arquivar && mudam.length) r.desfazer = { acao: "desarquivar", ids: mudam, parametros: {} };
}

// ── Entrada ────────────────────────────────────────────────────────────────

/** Executa (ou simula) a ação em massa. Lança ErroDoLote (status + código). */
export async function executarLote(ctx: Ctx, entidade: EntidadeCrm, p: PedidoDeLote): Promise<ResultadoDoLote> {
  conferirPermissao(ctx, entidade, p.acao);
  const r = vazio(p.acao, p.simular);
  const par = p.parametros;

  if (p.acao === "restaurar_responsavel") {
    await restaurarResponsavel(ctx, entidade, par.itens, r);
    return r;
  }
  if (p.acao === "restaurar_lixeira") {
    await restaurarLixeira(ctx, entidade, par.trashIds, r);
    return r;
  }
  if (p.acao === "restaurar_etapa") {
    const itens = (Array.isArray(par.itens) ? par.itens : [])
      .slice(0, LIMITE_DO_LOTE)
      .map((x) => ({ id: texto((x as { id?: unknown })?.id), stageId: texto((x as { stageId?: unknown })?.stageId) }))
      .filter((x) => x.id && x.stageId);
    if (!itens.length) throw new ErroDoLote("Nada para desfazer.", 400, "nada_para_desfazer");
    // Só os que a pessoa ainda enxerga; etapa sempre deste contrato.
    const escopo = await filtroDeEscopo(ctx, "negocios");
    const visiveis = new Set(
      (await prisma.deal.findMany({ where: { id: { in: itens.map((i) => i.id) }, orgId: ctx.orgId, ...escopo }, select: { id: true } })).map((d) => d.id)
    );
    const etapas = new Map(
      (
        await prisma.pipelineStage.findMany({ where: { id: { in: [...new Set(itens.map((i) => i.stageId))] }, pipeline: { orgId: ctx.orgId } }, select: { id: true, name: true } })
      ).map((s) => [s.id, s])
    );
    r.ignorados += itens.length - itens.filter((i) => visiveis.has(i.id)).length;
    const movs = itens.filter((i) => visiveis.has(i.id)).map((i) => ({ id: i.id, para: etapas.get(i.stageId) ?? null }));
    // Voltar de ganho/perdido é "reabrir" — é o que o Desfazer de um só já faz.
    await mover(ctx, movs, { reabrir: true }, r, false);
    delete r.desfazer;
    return r;
  }

  const ids = await idsDoAlvo(ctx, entidade, p, r, entidade === "negocios" && p.acao === "desarquivar");
  if (!ids.length) return r;

  if (entidade === "contatos") {
    const acao = p.acao as AcaoDeContato;
    if (acao === "atribuir") await atribuir(ctx, entidade, ids, texto(par.responsavelId) || null, r, p.simular);
    else if (acao === "etiqueta") await etiqueta(ctx, ids, par, r, p.simular);
    else if (acao === "sequencia") await sequencia(ctx, ids, par, r, p.simular);
    else if (acao === "apagar") await apagar(ctx, entidade, ids, par.definitivo === true, r, p.simular);
    return r;
  }

  const acao = p.acao as AcaoDeNegocio;
  if (acao === "atribuir") await atribuir(ctx, entidade, ids, texto(par.responsavelId) || null, r, p.simular);
  else if (acao === "mover") {
    const etapa = await etapaDoPedido(ctx, texto(par.stageId));
    await mover(ctx, ids.map((id) => ({ id, para: etapa })), {}, r, p.simular);
  } else if (acao === "ganho") {
    await mover(ctx, await movimentosDeFechamento(ctx, ids, "won"), {}, r, p.simular);
  } else if (acao === "perdido") {
    const motivoId = texto(par.motivoId);
    if (!motivoId) throw new ErroDoLote("Escolha o motivo da perda (da lista do funil).", 400, "motivo_obrigatorio");
    await mover(ctx, await movimentosDeFechamento(ctx, ids, "lost"), { perda: { motivoId, nota: texto(par.nota, 1000) } }, r, p.simular);
  } else if (acao === "arquivar") await arquivar(ctx, ids, true, r, p.simular);
  else if (acao === "desarquivar") await arquivar(ctx, ids, false, r, p.simular);
  else if (acao === "apagar") await apagar(ctx, entidade, ids, par.definitivo === true, r, p.simular);
  return r;
}
