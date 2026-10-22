import { NextResponse } from "next/server";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { getSessionContext } from "@/lib/server/permissions";
import { alterarVisao, apagarVisao } from "@/lib/server/visoes-salvas";
import { responderErro } from "../http";

// PATCH /api/visoes/[id] { nome?, visibilidade?, teamId?, config?, posicao? } → { visao }
// DELETE /api/visoes/[id] → { ok }
// Só o dono, ou quem administra o contrato numa visão compartilhada. Visão de
// outro contrato (ou que a pessoa não enxerga) = 404. A lista certa (contatos/
// negócios) já foi conferida na criação; aqui basta estar logado no contrato.
async function sessao() {
  const ctx = await getSessionContext();
  return ctx ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ visaoId: string }> }) {
  const ctx = await sessao();
  if (ctx instanceof NextResponse) return ctx;
  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const { visaoId } = await params;
  try {
    const visao = await alterarVisao(ctx, visaoId, {
      nome: corpo.nome,
      visibilidade: corpo.visibilidade,
      teamId: corpo.teamId,
      config: corpo.config,
      posicao: corpo.posicao,
    });
    return NextResponse.json({ visao });
  } catch (e) {
    return responderErro(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ visaoId: string }> }) {
  const ctx = await sessao();
  if (ctx instanceof NextResponse) return ctx;
  const { visaoId } = await params;
  try {
    await apagarVisao(ctx, visaoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
