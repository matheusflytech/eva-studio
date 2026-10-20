import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { buscarTudo } from "@/lib/server/busca";
import { normalizarConsulta } from "@/lib/busca/consulta";
import { lerTipos } from "@/lib/busca/resultado";

// Busca global da paleta (⌘K / Ctrl+K).
//
//   GET /api/busca?q=texto&tipos=negocios,contatos,empresas,notas,mensagens
//
// Sem `tipos`: todos. Cada tipo só entra se a pessoa pode vê-lo (negocios:ver,
// contatos:ver, empresas:ver, tarefas:ver para notas, conversas:ver para
// mensagens), sempre no contrato da aba e no escopo de dados do papel.
// Resposta: ResultadoDaBusca (src/lib/busca/resultado.ts), até 8 por tipo.
// O cabeçalho Server-Timing traz o tempo da busca no banco (medir o p95).
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const sp = new URL(request.url).searchParams;
  const c = normalizarConsulta(sp.get("q") ?? "");
  const pedidos = lerTipos(sp.get("tipos"));

  const inicio = performance.now();
  const resultado = await buscarTudo(ctx, c, pedidos);
  const ms = performance.now() - inicio;

  return NextResponse.json(resultado, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `busca;dur=${ms.toFixed(1)};desc="${resultado.modo.semAcento}"`,
    },
  });
}
