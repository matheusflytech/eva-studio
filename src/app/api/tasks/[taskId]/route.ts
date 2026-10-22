import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { statusDaReferencia } from "@/lib/server/crm";
import { JSON_INVALIDO, conferirReferencias, erro, lerCorpo, texto } from "@/lib/server/api-validacao";
import { ErroDeTarefa, carregarTarefaVisivel, concluirTarefa } from "@/lib/server/tarefas";
import { gravarDetalhes } from "@/lib/server/tarefas-detalhes";
import { lerPrazoDaTela, validarConclusao } from "@/lib/tarefas/conclusao";
import { normalizarTipoDeTarefa } from "@/lib/tarefas/tipos";

const NAO_ENCONTRADA = () => NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

// PATCH { done?, text?, type?, dueAt?, diaTodo?, prioridade?, duracaoMin?, assignedToId? }
//
// done: true exige o fluxo de conclusão (resultado + decisão do próximo
// passo), igual ao POST /api/tasks/[id]/concluir: concluir "só marcando" não
// existe mais na tela. done: false reabre (zera a data, sem histórico).
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const task = await carregarTarefaVisivel(ctx, taskId);
  if (!task) return NAO_ENCONTRADA();

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  const type = body.type !== undefined ? normalizarTipoDeTarefa(body.type) : undefined;
  if (type === null) return erro("Tipo de tarefa inválido.");
  const prazo = lerPrazoDaTela(body.dueAt);
  if (prazo === "invalida") return erro("Prazo inválido.");
  const erroRef = await conferirReferencias(ctx.orgId, { assignedToId: body.assignedToId });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));
  const text = typeof body.text === "string" ? texto(body.text, 5000) : undefined;

  if (body.done === true && !task.doneAt) {
    const v = validarConclusao(body);
    if (!v.ok) return NextResponse.json({ error: v.erro, codigo: v.codigo }, { status: 422 });
    try {
      const r = await concluirTarefa(ctx, task, v.pedido);
      return NextResponse.json({ task: { id: task.id, doneAt: new Date().toISOString() }, proximaId: r.proximaId });
    } catch (e) {
      if (e instanceof ErroDeTarefa) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
      throw e;
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      // Reabrir zera a data em vez de guardar histórico: a informação que
      // importa é "está feita ou não", e guardar meia-verdade confunde.
      doneAt: body.done === false ? null : undefined,
      text: text || undefined,
      type: type ?? undefined,
      dueAt: prazo === undefined ? undefined : prazo.dueAt,
      assignedToId: body.assignedToId !== undefined ? (body.assignedToId as string) || null : undefined,
    },
  });

  const detalhes: Parameters<typeof gravarDetalhes>[1] = {};
  if (prazo !== undefined) detalhes.allDay = body.diaTodo === true || prazo.diaTodo;
  if (body.prioridade === "alta" || body.prioridade === "normal") detalhes.priority = body.prioridade;
  if (typeof body.duracaoMin === "number" && body.duracaoMin > 0) detalhes.durationMin = Math.min(Math.round(body.duracaoMin), 1440);
  if (body.done === false) Object.assign(detalhes, { outcome: null, outcomeNote: null, nextStepDecision: null, nextTaskId: null });
  if (Object.keys(detalhes).length > 0) await gravarDetalhes(updated, detalhes);

  return NextResponse.json({ task: { id: updated.id, doneAt: updated.doneAt?.toISOString() ?? null } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const task = await carregarTarefaVisivel(ctx, taskId);
  if (!task) return NAO_ENCONTRADA();

  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
}
