import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import {
  CAMPOS_DE_CONTATO,
  FILTROS_DE_CONTATO,
  INCLUDE_CONTATO,
  carregarContato,
  lerDadosDeContato,
  serializarContato,
  serializarContatos,
  upsertContato,
  whereDeContatos,
} from "@/lib/server/api-v1/contatos";

// GET /api/v1/contacts — lista por cursor, em ordem de atualização (é o que
// a sincronização incremental com `updated_since` precisa).
export const GET = rotaV1({ recurso: "contacts" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, FILTROS_DE_CONTATO);
  const where = await whereDeContatos(ctx.orgId, sp);
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.contact.findMany({ where: cursor ? { AND: [where, cursor] } : where, include: INCLUDE_CONTATO, take, orderBy }),
    contar: () => prisma.contact.count({ where }),
  });
  return NextResponse.json(corpoDeLista(await serializarContatos(ctx.orgId, pagina.itens), pagina));
});

// POST /api/v1/contacts — cria. Já existe (mesmo e-mail ou telefone)? 409
// `duplicate` com o id existente; para atualizar, use PUT /contacts/upsert.
export const POST = rotaV1({ recurso: "contacts" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_CONTATO);
  const dados = await lerDadosDeContato(ctx.orgId, corpo);
  const r = await upsertContato(ctx.orgId, dados, { modo: "create" });
  const contato = await carregarContato(ctx.orgId, r.id);
  return NextResponse.json({ data: serializarContato(contato) }, { status: 201 });
});
