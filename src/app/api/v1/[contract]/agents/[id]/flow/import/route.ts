import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { carregarAgente } from "@/lib/server/api-v1/fluxos";
import { importarPacote } from "@/lib/server/subfluxos";

// POST /api/v1/agents/{id}/flow/import — um pacote "eva.flows" (de
// /flow/export ou do builder). O principal é substituído (desfazível por
// /flow/restore); fluxo extra com o mesmo nome é trocado, nome novo é criado,
// e os que não estão no pacote ficam. Tudo é validado antes de gravar.
export const POST = rotaV1<{ id: string }>({ recurso: "flows" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["format", "version", "agent_name", "exported_at", "main", "subflows"]);
  const agente = await carregarAgente(ctx.orgId, id);
  const r = await importarPacote(ctx.orgId, id, corpo, { modo: "api", temUrlDoFluxo: !!agente.outboundUrl?.trim() });
  return NextResponse.json({ data: { created: r.criados, updated: r.atualizados }, warnings: r.avisos });
});
