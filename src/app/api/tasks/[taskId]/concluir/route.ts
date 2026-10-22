import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { ErroDeTarefa, carregarTarefaVisivel, concluirTarefa } from "@/lib/server/tarefas";
import { validarConclusao } from "@/lib/tarefas/conclusao";

// POST /api/tasks/[id]/concluir
//   { resultado: falou|nao_atendeu|remarcou|outro, nota?,
//     proximo: { decisao: "sem_proximo" } | { decisao: "agendou", tipo, texto, dueAt, diaTodo? } }
//
// A decisão do próximo passo é obrigatória (422 proximo_passo_obrigatorio).
// Resultado e nota viram uma nota do negócio/contato (timeline).
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const task = await carregarTarefaVisivel(ctx, taskId);
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const v = validarConclusao(body);
  if (!v.ok) return NextResponse.json({ error: v.erro, codigo: v.codigo }, { status: 422 });
  try {
    const r = await concluirTarefa(ctx, task, v.pedido);
    return NextResponse.json({ ok: true, proximaId: r.proximaId, detalhesGravados: r.detalhesGravados });
  } catch (e) {
    if (e instanceof ErroDeTarefa) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
