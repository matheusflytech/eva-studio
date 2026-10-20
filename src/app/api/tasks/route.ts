import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { createTask, parseRelativeDue, statusDaReferencia } from "@/lib/server/crm";
import { JSON_INVALIDO, conferirReferencias, erro, lerCorpo, texto } from "@/lib/server/api-validacao";
import { listarTarefas } from "@/lib/server/tarefas";
import { visoesPermitidas } from "@/lib/tarefas/escopo";
import { normalizarTipoDeTarefa } from "@/lib/tarefas/tipos";
import { lerPrazoDaTela } from "@/lib/tarefas/conclusao";

// Tarefas da organização.
//   ?visao=minhas|equipe|todas  (padrão: minhas; limitado ao escopo de negócios do papel)
//   ?scope=minhas|todas         (nome antigo, ainda aceito)
//   ?status=abertas|feitas|todas  (padrão: abertas)
export async function GET(request: Request) {
  const ctx = await requirePermission("tarefas:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const params = new URL(request.url).searchParams;
  const { visao, tarefas } = await listarTarefas(ctx, {
    visao: params.get("visao") ?? params.get("scope"),
    status: params.get("status"),
  });
  return NextResponse.json({ visao, visoes: visoesPermitidas(ctx.escopo?.negocios), tasks: tarefas });
}

// POST { text, type?, dueAt? (ISO | "AAAA-MM-DDTHH:mm" de SP | "AAAA-MM-DD" = dia todo) | due? ("+2 dias"),
//        diaTodo?, prioridade? (normal|alta), duracaoMin?, contactId?, dealId?, assignedToId? }
export async function POST(request: Request) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const text = texto(body.text, 5000) ?? "";
  if (!text) return erro("Descreva a tarefa.");

  const bruto = body.type === undefined || body.type === null || body.type === "" ? "ligar" : body.type;
  const type = normalizarTipoDeTarefa(bruto);
  if (!type) return erro("Tipo de tarefa inválido.");

  // Aceita data absoluta (da tela) ou prazo relativo (de automação).
  const prazo = lerPrazoDaTela(body.dueAt);
  if (prazo === "invalida") return erro("Prazo inválido.");
  let dueAt = prazo?.dueAt ?? null;
  if (prazo === undefined && body.due) dueAt = parseRelativeDue(String(body.due));

  const erroRef = await conferirReferencias(ctx.orgId, {
    contactId: body.contactId,
    dealId: body.dealId,
    assignedToId: body.assignedToId,
  });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));

  const task = await createTask({
    orgId: ctx.orgId,
    text,
    type,
    contactId: (body.contactId as string) || null,
    dealId: (body.dealId as string) || null,
    assignedToId: (body.assignedToId as string) || ctx.userId,
    dueAt,
    origem: "manual",
    diaTodo: body.diaTodo === true || !!prazo?.diaTodo,
    prioridade: body.prioridade === "alta" ? "alta" : "normal",
    duracaoMin: typeof body.duracaoMin === "number" && Number.isFinite(body.duracaoMin) ? body.duracaoMin : null,
  });

  return NextResponse.json({ task: { id: task.id } });
}
