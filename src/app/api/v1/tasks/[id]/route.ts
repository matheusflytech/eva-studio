import { NextResponse } from "next/server";
import { publicarEvento } from "@/lib/server/eventos/barramento";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { tocarAtividadeDaTarefa } from "@/lib/server/atividade-do-negocio";
import { ErroApi } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { CAMPOS_DE_TAREFA, carregarTarefa, lerDadosDeTarefa, serializarTarefa } from "@/lib/server/api-v1/tarefas-notas";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "tasks" }, async (ctx, { id }) => {
  return NextResponse.json({ data: serializarTarefa(await carregarTarefa(ctx.orgId, id)) });
});

// PATCH parcial; done: true/false marca/desmarca (desmarcar zera done_at, como na tela).
export const PATCH = rotaV1<P>({ recurso: "tasks" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_TAREFA);
  const atual = await carregarTarefa(ctx.orgId, id);
  const d = await lerDadosDeTarefa(ctx.orgId, corpo);
  if (d.text === "") throw new ErroApi(400, "invalid_parameter", "text não pode ficar vazio.", { param: "text" });
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (d.text !== undefined) data.text = d.text;
  if (d.type !== undefined) data.type = d.type;
  if (d.dueAt !== undefined) data.dueAt = d.dueAt;
  if (d.contactId !== undefined) data.contactId = d.contactId;
  if (d.dealId !== undefined) data.dealId = d.dealId;
  if (d.assignedToId !== undefined) data.assignedToId = d.assignedToId;
  if (d.done === true && !atual.doneAt) data.doneAt = new Date();
  if (d.done === false) data.doneAt = null;
  const t = Object.keys(data).length > 0 ? await prisma.task.update({ where: { id }, data }) : atual;
  if (data.doneAt instanceof Date) {
    await tocarAtividadeDaTarefa(t);
    await publicarEvento({ orgId: ctx.orgId, tipo: "task.completed", objeto: "task", objetoId: t.id });
  }
  return NextResponse.json({ data: serializarTarefa(t) });
});

export const DELETE = rotaV1<P>({ recurso: "tasks" }, async (ctx, { id }) => {
  await carregarTarefa(ctx.orgId, id);
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ data: { id, deleted: true } });
});
