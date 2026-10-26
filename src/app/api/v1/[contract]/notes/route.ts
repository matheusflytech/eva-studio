import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { addNote } from "@/lib/server/crm";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import { CAMPOS_DE_NOTA, FILTROS_DE_NOTA, lerDadosDeNota, serializarNota, whereDeNotas } from "@/lib/server/api-v1/tarefas-notas";

// Nota não tem updatedAt: a lista anda por created_at (filtro created_since).
export const GET = rotaV1({ recurso: "notes" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, FILTROS_DE_NOTA);
  const where = whereDeNotas(ctx.orgId, sp);
  const pagina = await paginar({
    sp,
    campo: "createdAt",
    buscar: ({ cursor, take, orderBy }) => prisma.note.findMany({ where: cursor ? { AND: [where, cursor] } : where, take, orderBy }),
    contar: () => prisma.note.count({ where }),
  });
  return NextResponse.json(corpoDeLista(pagina.itens.map(serializarNota), pagina));
});

// POST /api/v1/notes — { text, contact_id? , deal_id? } (pelo menos um vínculo).
export const POST = rotaV1({ recurso: "notes" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_NOTA);
  const d = await lerDadosDeNota(ctx.orgId, corpo);
  if (!d.text) throw new ErroApi(400, "invalid_parameter", "text é obrigatório.", { param: "text" });
  if (!d.contactId && !d.dealId) {
    throw new ErroApi(400, "invalid_parameter", "A nota precisa de contact_id ou deal_id.", { param: "contact_id" });
  }
  const n = await addNote({ orgId: ctx.orgId, text: d.text, contactId: d.contactId ?? null, dealId: d.dealId ?? null, authorId: null });
  return NextResponse.json({ data: serializarNota(n) }, { status: 201 });
});
