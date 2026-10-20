import { somarDias, type FiltroDeConsulta, type GrupoDeFiltros } from "@/lib/consulta";
import type { FiltroCrm } from "@/lib/filtro-crm";
import { DIAS_PARADO } from "./modelo";

// ---------------------------------------------------------------------------
// Visões fixas de Negócios (Todos, Meus, Precisam de atenção, Fechando este
// mês) como condições do motor de filtro, para o quadro, a lista e as
// contagens das abas baterem com o servidor. As visões salvas são a L4.
// ---------------------------------------------------------------------------

export const VISOES_DE_NEGOCIO = [
  { id: "todos", label: "Todos os negócios" },
  { id: "meus", label: "Meus negócios" },
  { id: "atencao", label: "Precisam de atenção" },
  { id: "fechando", label: "Fechando este mês" },
] as const;

export type VisaoDeNegocio = (typeof VISOES_DE_NEGOCIO)[number]["id"];

/** Último dia do mês de `dia` (AAAA-MM-DD). */
export function fimDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  const primeiroDoProximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return somarDias(primeiroDoProximo, -1);
}

/**
 * O que a visão acrescenta: condições em E (`rapidos`) e, em "Precisam de
 * atenção", um grupo OU (parado há mais de 7 dias, tarefa atrasada ou
 * previsão vencida — a mesma regra do cartão).
 */
export function condicoesDaVisao(visao: string, meuId: string, hoje: string): { rapidos: FiltroDeConsulta[]; grupo?: GrupoDeFiltros } {
  const aberto: FiltroDeConsulta = { campo: "tipoEtapa", op: "qualquer", valores: ["open"] };
  switch (visao) {
    case "meus":
      return { rapidos: [{ campo: "responsavel", op: "qualquer", valores: [meuId || "__ninguem"] }] };
    case "fechando":
      return { rapidos: [aberto, { campo: "previsao", op: "entre", valor: `${hoje.slice(0, 7)}-01`, ate: fimDoMes(hoje) }] };
    case "atencao":
      return {
        rapidos: [aberto],
        grupo: {
          logica: "ou",
          condicoes: [
            { campo: "diasNaEtapa", op: "gt", valor: String(DIAS_PARADO) },
            { campo: "tarefa", op: "qualquer", valores: ["atrasada"] },
            { campo: "previsao", op: "antes", valor: hoje },
          ],
        },
      };
    default:
      return { rapidos: [] };
  }
}

/**
 * Junta a visão ao filtro montado da barra. O grupo OU da visão entra como
 * mais um grupo em E; se os avançados combinam grupos em OU, não dá para
 * somar sem mudar o sentido — aí a visão vale sozinha nos rapidos (sem o
 * grupo) e `conflito` avisa a tela.
 */
export function aplicarVisao(filtro: FiltroCrm, visao: string, meuId: string, hoje: string): { filtro: FiltroCrm; conflito: boolean } {
  const v = condicoesDaVisao(visao, meuId, hoje);
  const rapidos = [...v.rapidos, ...(filtro.rapidos ?? [])];
  const base: FiltroCrm = { ...filtro, ...(rapidos.length ? { rapidos } : {}) };
  if (!v.grupo) return { filtro: base, conflito: false };
  if (filtro.logica === "ou" && filtro.grupos.length > 1) return { filtro: base, conflito: true };
  return { filtro: { ...base, logica: "e", grupos: [v.grupo, ...filtro.grupos] }, conflito: false };
}
