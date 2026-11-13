// Situação de cada destinatário de um disparo, lida da fila de saída
// (eva_studio_outbound_queue). Sem dependência de servidor: a tela e a rota usam.

export type Situacao = "fila" | "enviando" | "enviado" | "entregue" | "lido" | "falhou";

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  fila: "Na fila",
  enviando: "Enviando",
  enviado: "Enviado",
  entregue: "Entregue",
  lido: "Lido",
  falhou: "Não chegou",
};

export interface ItemDaFila {
  status: string;
  deliveredAt?: Date | string | null;
  readAt?: Date | string | null;
}

export function situacaoDoItem(item: ItemDaFila): Situacao {
  if (item.status === "failed") return "falhou";
  if (item.status === "pending") return "fila";
  if (item.status === "sending") return "enviando";
  if (item.readAt) return "lido";
  if (item.deliveredAt) return "entregue";
  return "enviado";
}

/** "5511999990001@s.whatsapp.net" -> "5511999990001"; grupo e @lid ficam como estão. */
export function numeroDoDestino(contactId: string): string {
  return contactId.endsWith("@s.whatsapp.net") ? contactId.split("@")[0] : contactId;
}

/** Início do dia em Brasília (UTC-3, sem horário de verão desde 2019), como Date. */
export function inicioDoDiaEmBrasilia(agora = new Date()): Date {
  const local = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 3 * 3600_000);
}

/** Uma célula de CSV (separador ";", como o Excel em português abre). */
function celula(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Fórmula no começo vira texto: "=..." no Excel executaria.
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function paraCsv(cabecalho: string[], linhas: unknown[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
