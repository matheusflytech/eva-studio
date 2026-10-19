import { formatarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { ROTULO_CANAL } from "@/lib/consulta";
import { formatarTelefone } from "@/lib/telefone";
import { dataBR, dataHoraBR, montarCsv, type Celula } from "./csv";

// ---------------------------------------------------------------------------
// Planilha de contatos (botão Exportar da lista): uma linha por contato, com
// o MESMO filtro e escopo da tela (a rota usa o motor de listas). Sem
// `server-only`: só monta o texto, quem busca é a rota.
// ---------------------------------------------------------------------------

/** Até quantos contatos uma exportação pela tela leva. */
export const LIMITE_DE_EXPORTACAO_DE_CONTATOS = 10_000;

export interface ContatoParaExportar {
  name: string;
  email: string;
  phone: string;
  /** Secundários gravados como [{ value, label }]. */
  phones: unknown;
  jobTitle: string;
  empresa: string | null;
  proprietario: string | null;
  etiquetas: string[];
  canais: string[];
  source: string;
  optIn: boolean;
  lastSeenAt: Date | string;
  createdAt: Date | string;
  customFields: Record<string, unknown>;
}

const ORIGEM: Record<string, string> = { conversa: "Conversa", importacao: "Importação", api: "API", manual: "Manual" };

/** Telefones secundários como texto ("+55 11 3333-4444 (comercial)"). */
export function telefonesSecundarios(bruto: unknown): string {
  if (!Array.isArray(bruto)) return "";
  return bruto
    .map((t) => {
      const o = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
      const valor = typeof o.value === "string" ? o.value : "";
      if (!valor.trim()) return "";
      const texto = formatarTelefone(valor)?.texto ?? valor;
      const rotulo = typeof o.label === "string" && o.label.trim() ? ` (${o.label.trim()})` : "";
      return texto + rotulo;
    })
    .filter(Boolean)
    .join(" | ");
}

export function linhasDosContatos(contatos: ContatoParaExportar[], defs: DefinicaoDeCampo[]): Celula[][] {
  const cabecalho: Celula[] = [
    "Nome",
    "E-mail",
    "Celular",
    "Outros telefones",
    "Cargo",
    "Empresa",
    "Proprietário",
    "Etiquetas",
    "Canais",
    "Origem",
    "Aceita mensagens",
    "Última atividade",
    "Criado em",
    ...defs.map((d) => d.label),
  ];
  const linhas = contatos.map((c): Celula[] => [
    c.name,
    c.email,
    formatarTelefone(c.phone)?.texto ?? "",
    telefonesSecundarios(c.phones),
    c.jobTitle,
    c.empresa ?? "",
    c.proprietario ?? "",
    c.etiquetas.join(", "),
    [...new Set(c.canais.map((ch) => ROTULO_CANAL[ch] ?? ch))].join(", "),
    ORIGEM[c.source] ?? c.source,
    c.optIn ? "Sim" : "Não",
    dataHoraBR(c.lastSeenAt),
    dataBR(c.createdAt),
    ...defs.map((d) => formatarValor(d, c.customFields?.[d.key])),
  ]);
  return [cabecalho, ...linhas];
}

export function csvDosContatos(o: { contatos: ContatoParaExportar[]; defs: DefinicaoDeCampo[]; aviso?: string | null }): string {
  const linhas = linhasDosContatos(o.contatos, o.defs);
  if (o.aviso) linhas.push([], [o.aviso]);
  return montarCsv(linhas);
}
