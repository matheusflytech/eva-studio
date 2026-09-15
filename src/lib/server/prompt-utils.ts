import "server-only";

// Separado de extract-text.ts de propósito: aquele arquivo importa pdf-parse
// e mammoth (pesados, e pdf-parse quebra em runtime serverless com
// "DOMMatrix is not defined" fora de um browser/Node com polyfill). Qualquer
// módulo que só precisa truncar texto — como o flow-engine, chamado em toda
// mensagem — não pode arrastar essas dependências só por estarem no mesmo
// arquivo.
const MAX_CHARS_PER_DOC = 6000;

export function truncateForPrompt(text: string): string {
  if (text.length <= MAX_CHARS_PER_DOC) return text;
  return text.slice(0, MAX_CHARS_PER_DOC) + "\n[...documento truncado...]";
}
