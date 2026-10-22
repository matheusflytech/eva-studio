import { NextResponse } from "next/server";
import { ErroDaAutomacao } from "@/lib/server/automacoes/gerenciar";

export const SEM_TABELA = "As automações ainda não foram ativadas no banco deste ambiente (SQL 2026-10-24-automacoes.sql).";

/** Erro da regra vira 4xx com as pendências; tabela ausente vira o aviso de ativar. */
export function respostaDoErro(e: unknown) {
  if (e instanceof ErroDaAutomacao) return NextResponse.json({ error: e.message, pendencias: e.pendencias ?? [] }, { status: e.status });
  const msg = String((e as Error)?.message ?? e);
  if (/eva_studio_automac|does not exist|P2021/i.test(msg)) return NextResponse.json({ error: SEM_TABELA }, { status: 409 });
  console.error("[automacoes] erro", e);
  return NextResponse.json({ error: "Não deu certo. Tente de novo." }, { status: 500 });
}
