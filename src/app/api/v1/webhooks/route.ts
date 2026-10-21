import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { criarEndpoint, ErroDeWebhook, SEM_TABELA, serializarEndpoint } from "@/lib/server/webhooks/endpoints";

// /api/v1/webhooks — o gatilho do n8n assina ao ativar o workflow e cancela
// ao desativar (DELETE /webhooks/{id}). A tela de Integrações mostra os dois.

function paraErroApi(e: unknown): never {
  if (e instanceof ErroDeWebhook) throw new ErroApi(e.status, e.codigo, e.message);
  if (e instanceof ErroApi) throw e;
  throw new ErroApi(409, "webhooks_unavailable", SEM_TABELA);
}

export const GET = rotaV1({ recurso: "webhooks" }, async (ctx) => {
  try {
    const lista = await prisma.webhookEndpoint.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ data: lista.map(serializarEndpoint), has_more: false, next_cursor: null });
  } catch (e) {
    paraErroApi(e);
  }
});

export const POST = rotaV1({ recurso: "webhooks" }, async (ctx) => {
  const corpo = ctx.corpo();
  try {
    const { endpoint, segredo } = await criarEndpoint(ctx.orgId, {
      url: corpo.url,
      eventos: corpo.events,
      descricao: corpo.description,
      origem: "api",
    });
    return NextResponse.json({ data: { ...serializarEndpoint(endpoint), secret: segredo } }, { status: 201 });
  } catch (e) {
    paraErroApi(e);
  }
});
