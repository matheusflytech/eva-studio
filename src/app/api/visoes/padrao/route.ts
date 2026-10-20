import { NextResponse } from "next/server";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { definirPadrao } from "@/lib/server/visoes-salvas";
import { lerEntidade, responderErro, sessaoDaLista } from "../http";

// PUT /api/visoes/padrao { entidade, visao } → { padrao }
// `visao` = id de sistema ("todos", "meus"...) ou de visão salva que a pessoa enxerga.
export async function PUT(request: Request) {
  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const entidade = lerEntidade(corpo.entidade);
  if (!entidade) return erro("Lista inválida (contatos ou negocios).");
  const ctx = await sessaoDaLista(entidade);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ padrao: await definirPadrao(ctx, entidade, corpo.visao) });
  } catch (e) {
    return responderErro(e);
  }
}
