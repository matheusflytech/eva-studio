// Montagem do público e da mensagem do disparo (funções puras, usadas pela tela).

/**
 * Números de um CSV/TXT: um por linha. Com cabeçalho, usa a coluna cujo nome
 * parece telefone (telefone, phone, celular, whatsapp, numero); sem, o primeiro
 * trecho da linha com 10 a 15 dígitos. Repetidos saem.
 */
export function numerosDoArquivo(conteudo: string): string[] {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return [];
  const sep = [";", ",", "\t"].find((s) => linhas[0].includes(s));
  const celulas = (l: string) => (sep ? l.split(sep) : [l]).map((c) => c.trim().replace(/^"|"$/g, ""));

  let coluna = -1;
  const cab = celulas(linhas[0]).map((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  coluna = cab.findIndex((c) => /telefone|phone|celular|whatsapp|numero|fone/.test(c));
  const corpo = coluna >= 0 ? linhas.slice(1) : linhas;

  const vistos = new Set<string>();
  for (const l of corpo) {
    const cs = celulas(l);
    const candidato = coluna >= 0 ? cs[coluna] ?? "" : cs.find((c) => /^\+?[\d\s().-]{10,}$/.test(c) && digitos(c).length >= 10) ?? "";
    const d = digitos(candidato);
    if (d.length >= 10 && d.length <= 15) vistos.add(d);
  }
  return [...vistos];
}

const digitos = (s: string) => s.replace(/\D/g, "");

/**
 * Opções no fim do texto. Pelo WhatsApp não oficial botão não aparece em boa
 * parte dos aparelhos, então vira lista numerada para responder com o número.
 */
export function textoComOpcoes(texto: string, opcoes: string[]): string {
  const validas = opcoes.map((o) => o.trim()).filter(Boolean);
  if (validas.length === 0) return texto;
  return `${texto.trimEnd()}\n\nResponda com o número:\n${validas.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
}

/** Divide a lista em `partes` blocos de tamanho parecido, na ordem. */
export function dividirLista<T>(lista: T[], partes: number): T[][] {
  const n = Math.max(1, Math.floor(partes));
  const tamanho = Math.ceil(lista.length / n);
  return Array.from({ length: n }, (_, i) => lista.slice(i * tamanho, (i + 1) * tamanho)).filter((p) => p.length > 0);
}
