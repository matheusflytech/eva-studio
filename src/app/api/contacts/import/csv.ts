// Parser de CSV pequeno de propósito (sem dependência nova), mas tratando o
// que aparece de verdade em arquivo exportado de planilha: aspas, separador
// dentro de aspas, aspas escapadas com aspas duplas, CRLF e BOM. Fora do
// route.ts porque arquivo de rota só pode exportar os métodos HTTP.

/**
 * Separador pela primeira linha, contando só o que está fora de aspas. O Excel
 * em pt-BR salva CSV com ";" (a vírgula é o decimal); o resto do mundo, ",".
 */
export function detectarSeparador(text: string): string {
  const contagem: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) break;
    if (!inQuotes && char in contagem) contagem[char] += 1;
  }
  if (contagem[";"] > contagem[","] && contagem[";"] >= contagem["\t"]) return ";";
  if (contagem["\t"] > contagem[","]) return "\t";
  return ",";
}

export function parseCsv(bruto: string, separador?: string): string[][] {
  const text = bruto.replace(/^﻿/, "");
  const sep = separador ?? detectarSeparador(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
