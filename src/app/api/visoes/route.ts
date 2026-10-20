import { NextResponse } from "next/server";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { criarVisao, listarVisoes } from "@/lib/server/visoes-salvas";
import { lerEntidade, responderErro, sessaoDaLista } from "./http";

// GET /api/visoes?entidade=contatos|negocios[&pipeline=<id>]
//   → { disponivel, visoes: VisaoSalva[], padrao }  (só as que a pessoa enxerga
//   neste contrato: dela, da equipe dela ou do contrato todo)
// POST /api/visoes { entidade, nome, visibilidade?, teamId?, pipelineId?, config }
//   → { visao }  ("+", Duplicar e Salvar como nova). Sem a tabela: 409 visoes_indisponiveis.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const entidade = lerEntidade(sp.get("entidade"));
  if (!entidade) return erro("Lista inválida (contatos ou negocios).");
  const ctx = await sessaoDaLista(entidade);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json(await listarVisoes(ctx, entidade, sp.get("pipeline")?.trim() || null));
}

export async function POST(request: Request) {
  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const entidade = lerEntidade(corpo.entidade);
  if (!entidade) return erro("Lista inválida (contatos ou negocios).");
  const ctx = await sessaoDaLista(entidade);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const visao = await criarVisao(ctx, {
      entidade,
      nome: corpo.nome,
      visibilidade: corpo.visibilidade,
      teamId: corpo.teamId,
      pipelineId: corpo.pipelineId,
      config: corpo.config,
    });
    return NextResponse.json({ visao }, { status: 201 });
  } catch (e) {
    return responderErro(e);
  }
}
