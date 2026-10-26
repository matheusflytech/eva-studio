import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { apagarPelaApi } from "@/lib/server/api-v1/lixeira";
import {
  CAMPOS_DE_PATCH_DE_CONTATO,
  atualizarContato,
  carregarContato,
  lerDadosDeContato,
  serializarContatos,
} from "@/lib/server/api-v1/contatos";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "contacts" }, async (ctx, { id }) => {
  const [data] = await serializarContatos(ctx.orgId, [await carregarContato(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

// PATCH parcial: chave ausente não muda; null limpa. Etiquetas por
// add_tag_ids/remove_tag_ids (add passa por applyTag e dispara a sequência
// por etiqueta, como na tela). opt_in: false é opt-out de verdade.
export const PATCH = rotaV1<P>({ recurso: "contacts" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_PATCH_DE_CONTATO);
  await carregarContato(ctx.orgId, id);
  const dados = await lerDadosDeContato(ctx.orgId, corpo);
  await atualizarContato(ctx.orgId, id, dados);
  const [data] = await serializarContatos(ctx.orgId, [await carregarContato(ctx.orgId, id)], dados.source);
  return NextResponse.json({ data });
});

// Vai para a lixeira (30 dias; POST /contacts/{id}/restore traz de volta) e
// deixa a lápide em /contacts/deleted. Sem a lixeira no banco, apaga de vez.
export const DELETE = rotaV1<P>({ recurso: "contacts" }, async (ctx, { id }) => {
  await carregarContato(ctx.orgId, id);
  return apagarPelaApi(ctx.orgId, "contact", id, "API");
});
