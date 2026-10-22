import { NextResponse } from "next/server";
import { ErroDeWebhook, SEM_TABELA } from "@/lib/server/webhooks/endpoints";

/** Erro da regra vira 4xx; tabela ausente vira o aviso de ativar o SQL. */
export function respostaDoErro(e: unknown) {
  if (e instanceof ErroDeWebhook) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
  console.error("[webhooks] erro", e);
  return NextResponse.json({ error: SEM_TABELA }, { status: 409 });
}
