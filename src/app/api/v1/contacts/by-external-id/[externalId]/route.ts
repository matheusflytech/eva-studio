import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, segmento } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { idPorExterno } from "@/lib/server/api-v1/externos";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { CAMPOS_DE_CONTATO, carregarContato, lerDadosDeContato, serializarContatos, upsertContato } from "@/lib/server/api-v1/contatos";

type P = { externalId: string };

// GET /api/v1/contacts/by-external-id/{externalId}?external_source=
export const GET = rotaV1<P>({ recurso: "contacts" }, async (ctx, { externalId }) => {
  const sp = lerConsulta(ctx.url, ["external_source"]);
  const id = await idPorExterno(ctx.orgId, "contact", segmento(externalId), sp.get("external_source") || "api");
  if (!id) throw new ErroApi(404, "not_found", "Nenhum contato com esse external_id.");
  const [data] = await serializarContatos(ctx.orgId, [await carregarContato(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

// PUT /api/v1/contacts/by-external-id/{externalId} — upsert pelo id do seu
// sistema. Sem vínculo ainda, tenta e-mail/telefone antes de criar (e liga o
// id externo na ficha achada).
export const PUT = rotaV1<P>({ recurso: "contacts" }, async (ctx, { externalId }) => {
  const corpo = ctx.corpo();
  conferirCampos(
    corpo,
    CAMPOS_DE_CONTATO.filter((c) => c !== "external_id")
  );
  const id = segmento(externalId).slice(0, 255);
  if (!id) throw new ErroApi(400, "invalid_parameter", "external_id vazio.", { param: "external_id" });
  const dados = await lerDadosDeContato(ctx.orgId, corpo);
  dados.externalId = id;
  const r = await upsertContato(ctx.orgId, dados);
  const [data] = await serializarContatos(ctx.orgId, [await carregarContato(ctx.orgId, r.id)]);
  return NextResponse.json({ data, result: r.result, matched_by: r.matchedBy }, { status: r.result === "created" ? 201 : 200 });
});
