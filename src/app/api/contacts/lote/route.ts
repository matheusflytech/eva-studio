import { responderLote } from "@/lib/server/lote-http";

// POST /api/contacts/lote — ação em massa nos contatos.
//   { acao, ids?: string[] | filtro?: FiltroCrm, parametros?, simular? }
//   atribuir   { responsavelId | null }           contatos:editar
//   etiqueta   { tagId, modo: adicionar|remover } contatos:editar
//   sequencia  { sequenceId }                     sequencias:gerenciar
//   apagar     { definitivo? }                    contatos:apagar (vai para a lixeira)
//   restaurar_responsavel { itens: [{ id, responsavelId }] } / restaurar_lixeira { trashIds }
//     = o Desfazer (a resposta de cada ação traz o corpo pronto em `desfazer`)
// Por filtro: refeito no servidor (contrato + escopo), até 5.000 (`truncado`).
// Resposta: ResultadoDoLote (src/lib/lote/lote.ts). `simular: true` = prévia, nada gravado.
export async function POST(request: Request) {
  return responderLote(request, "contatos");
}
