// ---------------------------------------------------------------------------
// Alguns modelos, quando o texto do bloco cita uma ferramenta que não foi
// oferecida (ou quando erram o formato), escrevem a chamada na resposta:
//   crm_registrar_lead(nome="Lucas", interesse="...")
// Isso nunca é para o cliente ver. Tira o parágrafo que é só a chamada
// (nome_em_snake_case seguido de argumentos nomeados) e mantém o resto.
// ---------------------------------------------------------------------------

const CHAMADA = /^[ \t]*([a-z][a-z0-9]*_[a-z0-9_]+)\s*\(\s*[a-z_]+\s*=[\s\S]*?\)[ \t]*$/gim;

export function semChamadaEmTexto(texto: string | null): { texto: string | null; removidas: string[] } {
  if (!texto) return { texto, removidas: [] };
  const removidas: string[] = [];
  const limpo = texto
    .replace(CHAMADA, (_, nome: string) => {
      removidas.push(nome);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto: limpo || null, removidas };
}
