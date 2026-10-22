import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { conferirCampos, textoOpc } from "@/lib/server/api-v1/entrada";
import { carregarNota, serializarNota } from "@/lib/server/api-v1/tarefas-notas";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "notes" }, async (ctx, { id }) => {
  return NextResponse.json({ data: serializarNota(await carregarNota(ctx.orgId, id)) });
});

// Só o texto é editável: o vínculo da nota é o histórico de onde ela foi escrita.
export const PATCH = rotaV1<P>({ recurso: "notes" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["text"]);
  await carregarNota(ctx.orgId, id);
  const text = textoOpc(corpo, "text", 5000);
  if (text === "") throw new ErroApi(400, "invalid_parameter", "text não pode ficar vazio.", { param: "text" });
  const n = text !== undefined ? await prisma.note.update({ where: { id }, data: { text } }) : await carregarNota(ctx.orgId, id);
  return NextResponse.json({ data: serializarNota(n) });
});

export const DELETE = rotaV1<P>({ recurso: "notes" }, async (ctx, { id }) => {
  await carregarNota(ctx.orgId, id);
  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ data: { id, deleted: true } });
});
