import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarAgente } from "@/lib/server/api-v1/fluxos";
import { exportarPacote } from "@/lib/server/subfluxos";

// GET /api/v1/agents/{id}/flow/export — o bot inteiro (principal + fluxos
// extras) num pacote "eva.flows", o mesmo que o builder baixa e importa.
export const GET = rotaV1<{ id: string }>({ recurso: "flows" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  const agente = await carregarAgente(ctx.orgId, id);
  return NextResponse.json({ data: await exportarPacote(id, agente.name) });
});
