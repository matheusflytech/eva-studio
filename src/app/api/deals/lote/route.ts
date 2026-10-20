import { responderLote } from "@/lib/server/lote-http";

// POST /api/deals/lote — ação em massa nos negócios.
//   { acao, ids?: string[] | filtro?: FiltroCrm, pipelineId?, parametros?, simular? }
//   atribuir  { responsavelId | null }   negocios:editar
//   mover     { stageId }                negocios:editar — um a um por moveDealStage (regras da etapa)
//   ganho     {}                         negocios:editar — etapa de ganho do funil de cada negócio
//   perdido   { motivoId, nota? }        negocios:editar — motivo da lista do funil (obrigatório)
//   arquivar  {}                         negocios:editar
//   apagar    { definitivo? }            negocios:apagar (vai para a lixeira)
//   restaurar_responsavel / restaurar_etapa { itens: [{ id, stageId }] } / desarquivar / restaurar_lixeira
//     = o Desfazer (a resposta de cada ação traz o corpo pronto em `desfazer`)
// `pipelineId` com filtro = "Funil é X" (a lista é por funil). Bloqueados pela
// regra da etapa voltam em `falhas` com o motivo e os campos que faltam.
export async function POST(request: Request) {
  return responderLote(request, "negocios");
}
