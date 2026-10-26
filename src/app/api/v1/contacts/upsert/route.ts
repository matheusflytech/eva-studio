import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { CAMPOS_DE_CONTATO, carregarContato, lerDadosDeContato, serializarContatos, upsertContato } from "@/lib/server/api-v1/contatos";

// PUT /api/v1/contacts/upsert — cria ou atualiza. Busca por external_id,
// depois e-mail, depois telefone. Resposta diz `result` e `matched_by`.
export const PUT = rotaV1({ recurso: "contacts" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_CONTATO);
  const dados = await lerDadosDeContato(ctx.orgId, corpo);
  const r = await upsertContato(ctx.orgId, dados);
  const [data] = await serializarContatos(ctx.orgId, [await carregarContato(ctx.orgId, r.id)], dados.source);
  return NextResponse.json({ data, result: r.result, matched_by: r.matchedBy }, { status: r.result === "created" ? 201 : 200 });
});
