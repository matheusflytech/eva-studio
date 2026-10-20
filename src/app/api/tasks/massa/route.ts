import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { ErroDeTarefa, aplicarEmMassa, type AcaoEmMassa } from "@/lib/server/tarefas";
import { RESULTADOS, type ResultadoDaTarefa } from "@/lib/tarefas/tipos";

// POST /api/tasks/massa { ids: [...], acao, ... }
//   reagendar:  { para: "mais_1d" | "segunda" }
//   reatribuir: { responsavelId: string | null }
//   concluir:   { resultado, nota?, proximo: { decisao: "sem_proximo" } }  (a decisão é obrigatória)
// Tarefas fora do escopo do papel são ignoradas (contadas em `ignoradas`).
export async function POST(request: Request) {
  const ctx = await requirePermission("tarefas:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  if (ids.length === 0) return erro("Selecione ao menos uma tarefa.");
  if (ids.length > 500) return erro("No máximo 500 tarefas por vez.");

  let acao: AcaoEmMassa;
  if (body.acao === "reagendar") {
    if (body.para !== "mais_1d" && body.para !== "segunda") return erro("Escolha +1 dia ou próxima segunda.");
    acao = { acao: "reagendar", para: body.para };
  } else if (body.acao === "reatribuir") {
    acao = { acao: "reatribuir", responsavelId: typeof body.responsavelId === "string" && body.responsavelId ? body.responsavelId : null };
  } else if (body.acao === "concluir") {
    if (typeof body.resultado !== "string" || !(RESULTADOS as readonly string[]).includes(body.resultado)) {
      return NextResponse.json({ error: "Escolha o resultado.", codigo: "resultado_obrigatorio" }, { status: 422 });
    }
    const proximo = body.proximo as { decisao?: unknown } | undefined;
    if (proximo?.decisao !== "sem_proximo") {
      return NextResponse.json(
        { error: "Em massa, confirme “Sem próximo passo” (para agendar a próxima, conclua uma a uma).", codigo: "proximo_passo_obrigatorio" },
        { status: 422 }
      );
    }
    acao = { acao: "concluir", resultado: body.resultado as ResultadoDaTarefa, nota: typeof body.nota === "string" ? body.nota.trim().slice(0, 5000) : "" };
  } else {
    return erro("Ação inválida.");
  }

  try {
    return NextResponse.json(await aplicarEmMassa(ctx, ids, acao));
  } catch (e) {
    if (e instanceof ErroDeTarefa) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
