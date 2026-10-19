import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { ErroDeCrm, moveDealStage, statusDaReferencia } from "@/lib/server/crm";
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

  const fields = await carregarDefinicoes(ctx.orgId, "deal", deal.pipelineId);
  return NextResponse.json({ deal, fields });
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

  // ---- escrita ----

  try {
    if (novaEtapa) {
      const motivo = typeof body.lostReason === "string" ? body.lostReason.trim().slice(0, 500) : "";
      await moveDealStage(deal.id, novaEtapa, motivo);
    }

    if (Object.keys(data).length > 0) {
      await prisma.deal.update({ where: { id: deal.id }, data });
    }

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
  } catch (e) {
    if (e instanceof ErroDeCrm) return erro(e.message, e.status);
    return respostaDeErroDoPrisma(e);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("negocios:apagar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "negocios")) } });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  await prisma.deal.delete({ where: { id: deal.id } });
  return NextResponse.json({ ok: true });
}
