import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { ErroApi } from "@/lib/server/api-v1/http";
import { apagarEndpoint, SEM_TABELA, serializarEndpoint } from "@/lib/server/webhooks/endpoints";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "webhooks" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  const e = await prisma.webhookEndpoint.findFirst({ where: { id, orgId: ctx.orgId } }).catch(() => {
    throw new ErroApi(409, "webhooks_unavailable", SEM_TABELA);
  });
  if (!e) throw new ErroApi(404, "not_found", "Webhook não encontrado.");
  return NextResponse.json({ data: serializarEndpoint(e) });
});

export const DELETE = rotaV1<P>({ recurso: "webhooks" }, async (ctx, { id }) => {
  const apagou = await apagarEndpoint(ctx.orgId, id).catch(() => {
    throw new ErroApi(409, "webhooks_unavailable", SEM_TABELA);
  });
  if (!apagou) throw new ErroApi(404, "not_found", "Webhook não encontrado.");
  return NextResponse.json({ data: { id, deleted: true } });
});
