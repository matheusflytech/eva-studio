import { resolverVariaveis, type DadosDasVariaveis } from "./variaveis";
import { escaparHtml, htmlParaTexto, montarHtml, simplesParaHtml, simplesParaTexto, type ModoDoCorpo } from "./editor";

// Assunto, HTML e texto de um e-mail a partir do conteúdo (simples ou HTML),
// dos dados da pessoa e do rodapé. Puro: o envio (servidor) e a prévia do
// editor (navegador) usam exatamente esta função.

/** Monta assunto, HTML e texto do e-mail. Puro: a prévia do editor usa o mesmo caminho. */
export function montarEmail(
  c: { assunto: string; corpo: string; modo: ModoDoCorpo },
  dados: DadosDasVariaveis,
  rodape: { remetente: string; linkDeDescadastro: string }
): { assunto: string; html: string; texto: string; faltando: string[] } {
  const assunto = resolverVariaveis(c.assunto, dados);
  if (c.modo === "html") {
    const corpo = resolverVariaveis(c.corpo, dados, escaparHtml);
    return {
      assunto: assunto.texto,
      html: montarHtml(corpo.texto, rodape, assunto.texto),
      texto: `${htmlParaTexto(corpo.texto)}\n\nPara não receber mais: ${rodape.linkDeDescadastro}`,
      faltando: [...new Set([...assunto.faltando, ...corpo.faltando])],
    };
  }
  // Simples: resolve antes de converter; o conversor escapa tudo (inclusive os valores).
  const corpo = resolverVariaveis(c.corpo, dados);
  return {
    assunto: assunto.texto,
    html: montarHtml(simplesParaHtml(corpo.texto), rodape, assunto.texto),
    texto: `${simplesParaTexto(corpo.texto)}\n\nPara não receber mais: ${rodape.linkDeDescadastro}`,
    faltando: [...new Set([...assunto.faltando, ...corpo.faltando])],
  };
}
