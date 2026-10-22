import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { ErroDeTarefa, adiarTarefa, carregarTarefaVisivel } from "@/lib/server/tarefas";
import { OPCOES_DE_ADIAR, type OpcaoDeAdiar } from "@/lib/tarefas/adiar";
import { lerPrazoDaTela } from "@/lib/tarefas/conclusao";

// POST /api/tasks/[id]/adiar
//   { opcao: "1h" | "amanha" | "segunda" | "data", dueAt? (com "data"), empurrarPrevisao? }
// empurrarPrevisao: só tarefa de negócio; move a previsão de fechamento pelos
// mesmos dias (exige poder editar o negócio; senão volta um aviso).
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  if (typeof body.opcao !== "string" || !(OPCOES_DE_ADIAR as readonly string[]).includes(body.opcao)) {
    return erro("Opção de adiar inválida.");
  }
  const prazo = lerPrazoDaTela(body.dueAt);
  if (prazo === "invalida") return erro("Data inválida.");

  const task = await carregarTarefaVisivel(ctx, taskId);
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  try {
    const r = await adiarTarefa(ctx, task, {
      opcao: body.opcao as OpcaoDeAdiar,
      data: prazo?.dueAt ?? null,
      diaTodo: body.diaTodo === true || !!prazo?.diaTodo,
      empurrarPrevisao: body.empurrarPrevisao === true,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeTarefa) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
