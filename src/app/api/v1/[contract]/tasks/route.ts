import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTask } from "@/lib/server/crm";
import { tocarAtividadeDaTarefa } from "@/lib/server/atividade-do-negocio";
import { publicarEvento } from "@/lib/server/eventos/barramento";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import {
  CAMPOS_DE_TAREFA,
  FILTROS_DE_TAREFA,
  lerDadosDeTarefa,
  serializarTarefa,
  whereDeTarefas,
} from "@/lib/server/api-v1/tarefas-notas";

export const GET = rotaV1({ recurso: "tasks" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, FILTROS_DE_TAREFA);
  const where = whereDeTarefas(ctx.orgId, sp);
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) => prisma.task.findMany({ where: cursor ? { AND: [where, cursor] } : where, take, orderBy }),
    contar: () => prisma.task.count({ where }),
  });
  return NextResponse.json(corpoDeLista(pagina.itens.map(serializarTarefa), pagina));
});

// POST /api/v1/tasks — { text, type?, due_at? | due? ("2d"), contact_id?, deal_id?, assigned_to_id? }
export const POST = rotaV1({ recurso: "tasks" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_TAREFA);
  const d = await lerDadosDeTarefa(ctx.orgId, corpo);
  if (!d.text) throw new ErroApi(400, "invalid_parameter", "text é obrigatório.", { param: "text" });
  const task = await createTask({
    orgId: ctx.orgId,
    text: d.text,
    type: d.type,
    contactId: d.contactId ?? null,
    dealId: d.dealId ?? null,
    assignedToId: d.assignedToId ?? null,
    dueAt: d.dueAt ?? null,
    origem: "automacao",
  });
  const final = d.done ? await prisma.task.update({ where: { id: task.id }, data: { doneAt: new Date() } }) : task;
  if (d.done) {
    await tocarAtividadeDaTarefa(final);
    await publicarEvento({ orgId: ctx.orgId, tipo: "task.completed", objeto: "task", objetoId: final.id });
  }
  return NextResponse.json({ data: serializarTarefa(final) }, { status: 201 });
});
