import { NextResponse } from "next/server";
import { fotoDoRegistro, publicarAlteracao } from "@/lib/server/eventos/alteracoes";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { ErroDaMudanca, ErroDeCrm, moveDealStage, statusDaReferencia, type OpcoesDaMudanca } from "@/lib/server/crm";
import { gravarPerda, lerMotivos, lerPerda, lerRegras } from "@/lib/server/regras-de-etapa";
import { tocarAtividade, ultimaAtividadePorNegocio } from "@/lib/server/atividade-do-negocio";
import { diasDeFollowUp, resolverPerda } from "@/lib/regras-de-etapa";
import { aplicarValores, carregarDefinicoes } from "@/lib/server/custom-fields";
import {
  JSON_INVALIDO,
  conferirReferencias,
  dataOpcional,
  erro,
  inteiroEntre,
  lerCorpo,
  reaisParaCentavos,
  respostaDeErroDoPrisma,
  texto,
} from "@/lib/server/api-validacao";
import { negocioUsaSomaDosItens } from "@/lib/server/produtos";
import { responderExclusao } from "@/lib/server/lixeira-http";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("negocios:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({
    // Escopo do papel ("só os meus"/"da equipe"): fora dele, o negócio "não existe".
    where: { id: dealId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "negocios")) },
    include: {
      stage: true,
      pipeline: { include: { stages: { orderBy: { position: "asc" } } } },
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: { include: { contact: { select: { id: true, name: true, email: true, phone: true } } } },
      // Filtro por org de novo: tarefa/nota de outra org apontando para este
      // negócio (dado gravado antes da checagem nas rotas) não vaza.
      // Em aberto primeiro: no Postgres NULL vem por último no "asc".
      tasks: {
        where: { orgId: ctx.orgId },
        orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }],
      },
      notes: { where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const [fields, { regras }, perda, atividade] = await Promise.all([
    carregarDefinicoes(ctx.orgId, "deal", deal.pipelineId),
    lerRegras(deal.pipeline.stages),
    lerPerda(deal.id),
    ultimaAtividadePorNegocio([deal.id]),
  ]);
  return NextResponse.json({
    deal: { ...deal, lastActivityAt: atividade.get(deal.id)?.toISOString() ?? null, perda },
    fields,
    // Regras das etapas do funil: orientação, campos exigidos e prazo de parado.
    regras: Object.fromEntries(regras),
  });
}

// PATCH cobre três coisas: mover de etapa (passa por moveDealStage, que
// atualiza probabilidade e carimba fechamento), reordenar o card dentro da
// coluna, e editar os campos.
//
// Tudo é validado antes da primeira escrita: um campo inválido não pode
// deixar o negócio movido de etapa e o resto sem salvar.
export async function PATCH(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("negocios:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "negocios")) } });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  // ---- validação ----

  let novaEtapa: string | null = null;
  const reabrir = body.reabrir === true;
  // "Reabrir" sem etapa: volta para a etapa aberta de onde o negócio saiu ao
  // fechar (ou a primeira aberta do funil).
  if (reabrir && (body.stageId === undefined || body.stageId === null || body.stageId === "")) {
    const destino = await etapaParaReabrir(deal.id, deal.pipelineId, deal.stageId);
    if (!destino) return erro("O funil não tem etapa aberta para reabrir o negócio.");
    body.stageId = destino;
  }
  if (body.stageId !== undefined && body.stageId !== null && body.stageId !== "") {
    if (typeof body.stageId !== "string") return erro("Etapa inválida.");
    if (body.stageId !== deal.stageId) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: body.stageId, pipeline: { orgId: ctx.orgId } },
        select: { id: true, pipelineId: true },
      });
      if (!stage) return erro("Etapa não encontrada.", 404);
      // Trocar de funil levaria os campos personalizados de um funil para
      // outro; nenhuma tela faz isso, então é recusado em vez de meio suportado.
      if (stage.pipelineId !== deal.pipelineId) return erro("Etapa de outro funil.");
      novaEtapa = stage.id;
    }
  }

  const erroRef = await conferirReferencias(ctx.orgId, {
    contactId: body.addContactId,
    companyId: body.companyId,
    ownerId: body.ownerId,
  });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));

  const data: Prisma.DealUpdateInput = {};

  // Campos personalizados: mescla com o que já existe. Valor null apaga.
  if (body.customFields && typeof body.customFields === "object") {
    const defs = await carregarDefinicoes(ctx.orgId, "deal", deal.pipelineId);
    const r = aplicarValores(
      defs,
      (deal.customFields ?? {}) as Record<string, unknown>,
      body.customFields as Record<string, unknown>
    );
    // Obrigatório só vale pro que a pessoa mexeu agora: negócio antigo não pode
    // ficar travado por um campo que passou a ser obrigatório depois.
    if (r.ok) {
      for (const d of defs) {
        if (d.required && d.key in (body.customFields as object) && r.valores[d.key] === undefined) {
          return NextResponse.json({ error: d.label + ": preenchimento obrigatório." }, { status: 400 });
        }
      }
    }
    if (!r.ok) return NextResponse.json({ error: r.erros.join(" "), erros: r.erros }, { status: 400 });
    data.customFields = r.valores as Prisma.InputJsonValue;
  }
  const name = typeof body.name === "string" ? texto(body.name, 200) : undefined;
  if (name) data.name = name;
  if (typeof body.description === "string") data.description = texto(body.description, 5000);
  if (body.amount !== undefined) {
    const centavos = reaisParaCentavos(body.amount);
    if (centavos === null || centavos === undefined) return erro("Valor inválido (máximo R$ 21 milhões).");
    // Com produtos e sem "valor manual", o valor é a soma dos itens.
    if (await negocioUsaSomaDosItens(deal.id)) {
      return erro("O valor deste negócio vem dos produtos. Ligue \"Usar valor manual\" na ficha para digitar outro.", 409);
    }
    data.amountCents = centavos;
  }
  if (body.probability !== undefined) {
    const p = inteiroEntre(body.probability, 0, 100);
    if (p === null) return erro("Probabilidade inválida.");
    data.probability = p;
  }
  if (body.position !== undefined) {
    const pos = inteiroEntre(body.position, -2_000_000_000, 2_000_000_000);
    if (pos === null) return erro("Posição inválida.");
    data.position = pos;
  }
  // Sem mudança de etapa: é o caso de quem perdeu o negócio agora e só volta
  // depois para registrar por quê (mandar a etapa atual junto não atrapalha).
  if (typeof body.lostReason === "string" && !novaEtapa) data.lostReason = body.lostReason.trim().slice(0, 500);
  if (body.expectedClosingAt !== undefined) {
    const d = dataOpcional(body.expectedClosingAt);
    if (d === "invalida") return erro("Previsão de fechamento inválida.");
    data.expectedClosingAt = d ?? null;
  }
  if (body.archived === true) data.archivedAt = new Date();
  if (body.archived === false) data.archivedAt = null;
  if (body.companyId !== undefined) {
    data.company = body.companyId ? { connect: { id: String(body.companyId) } } : { disconnect: true };
  }
  if (body.ownerId !== undefined) {
    data.owner = body.ownerId ? { connect: { id: String(body.ownerId) } } : { disconnect: true };
  }

  // ---- regras da etapa (antes de gravar qualquer coisa) ----

  // O que esta mesma requisição grava conta na validação: é assim que o modal
  // "Complete para mover" salva os campos e move numa ação só.
  const pendente: NonNullable<OpcoesDaMudanca["pendente"]> = {};
  if (typeof data.amountCents === "number") pendente.amountCents = data.amountCents;
  if (data.expectedClosingAt !== undefined) pendente.expectedClosingAt = data.expectedClosingAt as Date | null;
  if (body.ownerId !== undefined) pendente.ownerId = body.ownerId ? String(body.ownerId) : null;
  if (body.companyId !== undefined) pendente.companyId = body.companyId ? String(body.companyId) : null;
  if (data.customFields !== undefined) pendente.customFields = data.customFields as Record<string, unknown>;
  if (typeof body.addContactId === "string" && body.addContactId) pendente.contatosNovos = 1;
  const opcoesDaMudanca: OpcoesDaMudanca = {
    reabrir,
    pendente,
    perda: {
      motivoId: typeof body.motivoId === "string" ? body.motivoId : null,
      motivo: typeof body.lostReason === "string" ? body.lostReason : null,
      nota: typeof body.notaDaPerda === "string" ? body.notaDaPerda : null,
    },
    followUpDias: diasDeFollowUp(body.followUpDias),
  };

  // Motivo estruturado sem mudar de etapa (negócio já perdido, motivo corrigido).
  let perdaSemMover: { motivoId: string | null; rotulo: string; nota: string } | null = null;
  if (!novaEtapa && typeof body.motivoId === "string" && body.motivoId) {
    const { motivos } = await lerMotivos(deal.pipelineId);
    const r = resolverPerda(motivos, opcoesDaMudanca.perda ?? {});
    if (!r.ok) return NextResponse.json({ error: r.erro, codigo: "motivo_obrigatorio" }, { status: 422 });
    perdaSemMover = r.perda;
    data.lostReason = r.perda.rotulo;
  }

  try {
    if (novaEtapa) await moveDealStage(deal.id, novaEtapa, { ...opcoesDaMudanca, simular: true });
  } catch (e) {
    if (e instanceof ErroDaMudanca) return respostaDaMudanca(e);
    if (e instanceof ErroDeCrm) return erro(e.message, e.status);
    return respostaDeErroDoPrisma(e);
  }

  // ---- escrita ----

  const antes = await fotoDoRegistro(ctx.orgId, "deal", deal.id);
  try {
    if (Object.keys(data).length > 0) {
      await prisma.deal.update({ where: { id: deal.id }, data });
    }
    if (perdaSemMover) await gravarPerda({ dealId: deal.id, orgId: ctx.orgId, pipelineId: deal.pipelineId }, perdaSemMover);

    if (typeof body.addContactId === "string" && body.addContactId) {
      await prisma.dealContact.upsert({
        where: { dealId_contactId: { dealId: deal.id, contactId: body.addContactId } },
        create: { dealId: deal.id, contactId: body.addContactId },
        update: {},
      });
    }
    if (typeof body.removeContactId === "string" && body.removeContactId) {
      await prisma.dealContact.deleteMany({ where: { dealId: deal.id, contactId: body.removeContactId } });
    }

    // Por último: os campos que a mesma ação gravou já estão no banco.
    if (novaEtapa) await moveDealStage(deal.id, novaEtapa, opcoesDaMudanca);
  } catch (e) {
    if (e instanceof ErroDaMudanca) return respostaDaMudanca(e);
    if (e instanceof ErroDeCrm) return erro(e.message, e.status);
    return respostaDeErroDoPrisma(e);
  }

  // Edição de campo zera o relógio do "parado" (reordenar ou arquivar, não).
  const editou = Object.keys(data).some((k) => k !== "position" && k !== "archivedAt") || !!body.addContactId || !!body.removeContactId;
  if (editou) await tocarAtividade(deal.id);
  await publicarAlteracao(ctx.orgId, "deal", deal.id, antes);

  return NextResponse.json({ ok: true });
}

/** 409 negócio fechado / 422 campos obrigatórios ou motivo — com a lista exata do que falta. */
function respostaDaMudanca(e: ErroDaMudanca) {
  return NextResponse.json(
    { error: e.message, codigo: e.codigo, ...(e.faltando.length ? { faltando: e.faltando } : {}) },
    { status: e.status }
  );
}

/** Etapa aberta de onde o negócio saiu ao fechar; senão a primeira aberta do funil. */
async function etapaParaReabrir(dealId: string, pipelineId: string, stageAtual: string): Promise<string | null> {
  const abertas = await prisma.pipelineStage.findMany({
    where: { pipelineId, type: "open" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = new Set(abertas.map((s) => s.id));
  try {
    const ultimo = await prisma.dealStageEvent.findFirst({
      where: { dealId, toStageId: stageAtual },
      orderBy: { at: "desc" },
      select: { fromStageId: true },
    });
    if (ultimo?.fromStageId && ids.has(ultimo.fromStageId)) return ultimo.fromStageId;
  } catch {
    // sem histórico: primeira aberta
  }
  return abertas[0]?.id ?? null;
}

// Vai para a lixeira (30 dias), com tarefas, notas, histórico e itens na foto.
export async function DELETE(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("negocios:apagar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "negocios")) } });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  return responderExclusao(request, ctx, "deal", deal.id);
}
