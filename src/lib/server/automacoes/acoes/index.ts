import "server-only";
import { ACOES_DE_REGISTRO } from "./registro";
import { ACOES_DE_PESSOAS } from "./pessoas";
import { ACOES_DE_CLIENTE } from "./cliente";
import { ACOES_DE_INTEGRACAO } from "./integracao";
import type { ManipuladorDeAcao } from "./tipos";

// ---------------------------------------------------------------------------
// Ações que o motor sabe executar, uma por tipo do catálogo
// (src/lib/automacoes/catalogo.ts). Rodam dentro de comAtor({ tipo:
// "automacao", ... }): o que mudarem no CRM sai com esse ator, e o anti-loop
// do barramento enxerga. O teste (acoes.test) confere que nenhuma ação do
// catálogo ficou sem manipulador.
// ---------------------------------------------------------------------------

export type { CtxDaAcao, ManipuladorDeAcao, ResultadoDaAcao } from "./tipos";

export const MANIPULADORES: Partial<Record<string, ManipuladorDeAcao>> = {
  ...ACOES_DE_REGISTRO,
  ...ACOES_DE_PESSOAS,
  ...ACOES_DE_CLIENTE,
  ...ACOES_DE_INTEGRACAO,
};
