import type { ReportResult } from "@/lib/report-query";

// Resultado de um cartão em CSV para o Excel em português: ponto e vírgula,
// vírgula decimal e BOM (sem ele o Excel desfaz os acentos).
// Texto que começa com = + - @ ou tabulação ganha um apóstrofo na frente: sem
// isso um nome de contato como "=HYPERLINK(...)" viraria fórmula na planilha.

function celula(v: string | number | boolean | null): string {
  if (v === null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  const texto = typeof v === "boolean" ? (v ? "Sim" : "Não") : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function csvDoResultado(r: ReportResult): string {
  const linhas = [r.columns.map((c) => celula(c.label)), ...r.rows.map((l) => l.map(celula))];
  return "﻿" + linhas.map((l) => l.join(";")).join("\r\n") + "\r\n";
}
