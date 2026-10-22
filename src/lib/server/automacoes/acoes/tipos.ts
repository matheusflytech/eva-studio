import type { Contexto } from "@/lib/automacoes/condicoes";
import type { Objeto } from "@/lib/automacoes/tipos";
import type { ContextoDaExecucao } from "../contexto";

// Contrato entre o executor e as ações. Cada ação recebe a configuração já com
// as variáveis trocadas e diz: deu certo (a saída vira `passos.<id>`), pulou
// (com o motivo) ou falhou (retentável ou não).

export interface CtxDaAcao {
  orgId: string;
  automacaoId: string;
  execucaoId: string;
  noId: string;
  objeto: Objeto;
  objetoId: string;
  contexto: Contexto;
  ids: ContextoDaExecucao["ids"];
  /** `execucao:no:tentativa`: ação externa manda junto (webhook-id) e confere antes de repetir. */
  idempotencia: string;
  teste: boolean;
  agora: Date;
}

export type ResultadoDaAcao =
  | { ok: true; saida?: Record<string, unknown>; pulado?: string }
  | { ok: false; erro: string; retentavel?: boolean; tentarDepoisMs?: number };

export type ManipuladorDeAcao = (config: Record<string, unknown>, ctx: CtxDaAcao) => Promise<ResultadoDaAcao>;
