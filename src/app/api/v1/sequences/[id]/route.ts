import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { CAMPOS_DE_SEQUENCIA, atualizarSequencia, carregarSequencia, serializarSequencia } from "@/lib/server/api-v1/sequencias";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "sequences" }, async (ctx, { id }) => {
  const s = await carregarSequencia(ctx.orgId, id);
  const ativos = await prisma.sequenceEnrollment.count({ where: { sequenceId: id, status: "active" } });
  return NextResponse.json({ data: serializarSequencia(s, ativos) });
});

// PATCH parcial; `steps` substitui a régua inteira (como na tela).
export const PATCH = rotaV1<P>({ recurso: "sequences" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_SEQUENCIA);
  return NextResponse.json({ data: serializarSequencia(await atualizarSequencia(ctx.orgId, id, corpo)) });
});

export const DELETE = rotaV1<P>({ recurso: "sequences" }, async (ctx, { id }) => {
  await carregarSequencia(ctx.orgId, id);
  await prisma.sequence.delete({ where: { id } });
  return NextResponse.json({ data: { id, deleted: true } });
});
