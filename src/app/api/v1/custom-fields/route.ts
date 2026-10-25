import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { carregarDefinicoes, serializarDefinicao } from "@/lib/server/custom-fields";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { numerosDeFunis, uuidDoFunil } from "@/lib/server/api-v1/funis";

// GET /api/v1/custom-fields?entity=deal|contact&pipeline=<número do funil> — só leitura.
// Com pipeline: os campos que valem naquele funil (globais + do funil).
// Sem: todos da entidade. `key` é o que vai em custom_fields de contato/negócio.
export const GET = rotaV1({ recurso: "custom_fields" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, ["entity", "pipeline"]);
  const entity = sp.get("entity") ?? "deal";
  if (entity !== "deal" && entity !== "contact") {
    throw new ErroApi(400, "invalid_parameter", "entity precisa ser deal ou contact.", { param: "entity" });
  }
  const pipeline = sp.get("pipeline") ? await uuidDoFunil(ctx.orgId, sp.get("pipeline"), "pipeline") : null;
  const defs = pipeline
    ? await carregarDefinicoes(ctx.orgId, entity, pipeline)
    : (
        await prisma.customField.findMany({
          where: { orgId: ctx.orgId, entity },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        })
      ).map(serializarDefinicao);
  const funis = await numerosDeFunis(defs.map((d) => d.pipelineId));
  return NextResponse.json({
    data: defs.map((d) => ({
      id: d.id,
      entity: d.entity,
      pipeline_id: d.pipelineId ? funis.get(d.pipelineId) ?? null : null,
      key: d.key,
      label: d.label,
      type: d.type,
      options: d.options,
      required: d.required,
      help_text: d.helpText,
      position: d.position,
    })),
    has_more: false,
    next_cursor: null,
  });
});
