// Regras puras do cartão personalizável: o que vai no título, como os campos
// escolhidos se agrupam no cartão e o texto de cada campo (cartão e prévia).
// Sem React: a ordem e a formatação ficam testadas à parte.

import { CAMPOS_PADRAO, type CampoDoCartao, type CampoPadrao, type Densidade } from "@/lib/cartao-layout";
import { formatarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { resumoDosProdutos } from "@/lib/produtos";
import { dataCurta, dataCurtaDoDia, diaDaPrevisao, dinheiro, sinalDoNegocio, tempoNaEtapa, type NegocioKanban } from "./modelo";

const FUSO = "America/Sao_Paulo";

export const ehPersonalizado = (c: CampoDoCartao): c is `cf:${string}` => c.startsWith("cf:");

/** key → rótulo dos campos personalizados (para rotuloDoCampo). */
export function rotulosPersonalizados(defs: DefinicaoDeCampo[]): Record<string, string> {
  return Object.fromEntries(defs.map((d) => [d.key, d.label]));
}

/** Tudo que pode entrar no cartão ou na prévia: padrão primeiro, depois os personalizados. */
export function camposDisponiveis(defs: DefinicaoDeCampo[]): CampoDoCartao[] {
  return [...(Object.keys(CAMPOS_PADRAO) as CampoPadrao[]), ...defs.map((d) => `cf:${d.key}` as const)];
}

/**
 * Título (vira o link da ficha) e subtítulo do cartão. Com "empresa" o título
 * é quem compra (empresa, senão o contato); sem ela, o nome do negócio.
 * "nome" vira subtítulo só quando não repete o título.
 */
export function tituloDoCartao(deal: NegocioKanban, campos: CampoDoCartao[]): { titulo: string; subtitulo: string } {
  const contato = deal.contacts[0]?.name || "";
  const titulo = campos.includes("empresa") ? deal.company?.name || contato || deal.name : deal.name;
  const subtitulo = campos.includes("nome") && titulo !== deal.name ? deal.name : "";
  return { titulo, subtitulo };
}

/** Campos que moram no cabeçalho do cartão (título, subtítulo e ícone do WhatsApp). */
const DO_CABECALHO = new Set<CampoDoCartao>(["empresa", "nome", "whatsapp"]);
/** Cabem lado a lado numa linha só: valor, barra da chance e avatar do responsável. */
const DE_METRICA = new Set<CampoDoCartao>(["valor", "probabilidade", "responsavel"]);

export type BlocoDoCartao =
  | { tipo: "metricas"; campos: CampoDoCartao[] }
  | { tipo: "etiquetas"; campos: `cf:${string}`[] }
  | { tipo: "linha"; campo: CampoDoCartao };

/**
 * Corpo do cartão na ordem escolhida. Métricas vizinhas dividem a linha;
 * campos personalizados vizinhos viram etiquetas (no compacto, uma linha
 * cada, para o cartão não crescer para os lados).
 */
export function blocosDoCartao(campos: CampoDoCartao[], densidade: Densidade): BlocoDoCartao[] {
  const blocos: BlocoDoCartao[] = [];
  for (const campo of campos) {
    if (DO_CABECALHO.has(campo)) continue;
    const ultimo = blocos[blocos.length - 1];
    if (DE_METRICA.has(campo)) {
      if (ultimo?.tipo === "metricas") ultimo.campos.push(campo);
      else blocos.push({ tipo: "metricas", campos: [campo] });
    } else if (ehPersonalizado(campo) && densidade === "confortavel") {
      if (ultimo?.tipo === "etiquetas") ultimo.campos.push(campo);
      else blocos.push({ tipo: "etiquetas", campos: [campo] });
    } else {
      blocos.push({ tipo: "linha", campo });
    }
  }
  return blocos;
}

export interface ContextoDoCampo {
  tipoDaEtapa: string;
  /** Prazo de parado da etapa (null = nunca; ausente = 7). */
  prazoParado?: number | null;
  agora: Date;
  defs: DefinicaoDeCampo[];
}

function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

/** "31 minutos nesta etapa" no cartão; "31 minutos" na prévia. */
function textoDoTempoNaEtapa(deal: NegocioKanban, agora: Date, curto: boolean): string {
  const t = tempoNaEtapa(deal.stageSince, agora);
  if (t === "agora") return curto ? "Entrou agora nesta etapa" : "Entrou agora";
  return curto ? `${t} nesta etapa` : t;
}

/**
 * Texto de um campo para um negócio; "" quando não há o que mostrar.
 * "curto" é o do cartão ("Fecha 28 out"), "completo" o da prévia ("28/10/2026").
 */
export function textoDoCampo(
  campo: CampoDoCartao,
  deal: NegocioKanban,
  ctx: ContextoDoCampo,
  formato: "curto" | "completo" = "completo"
): string {
  const curto = formato === "curto";
  if (ehPersonalizado(campo)) {
    const key = campo.slice(3);
    const def = ctx.defs.find((d) => d.key === key);
    return def ? formatarValor(def, deal.customFields?.[key]) : "";
  }
  const contato = deal.contacts[0];
  switch (campo as CampoPadrao) {
    case "empresa":
      return deal.company?.name || "";
    case "nome":
      return deal.name;
    case "valor":
      return deal.amountCents > 0 ? dinheiro(deal.amountCents) : "";
    case "probabilidade":
      return `${deal.probability}%`;
    case "responsavel":
      return deal.owner?.name || "";
    case "proximoPasso":
      return sinalDoNegocio(deal, ctx.tipoDaEtapa, ctx.agora, ctx.prazoParado)?.texto ?? deal.nextTask?.text.trim() ?? "";
    case "whatsapp":
      return deal.whatsapp ? (deal.whatsapp.naoLida ? "Mensagem não lida" : "Conversa aberta") : "";
    case "previsao": {
      if (!deal.expectedClosingAt) return "";
      const dia = diaDaPrevisao(deal.expectedClosingAt);
      return curto ? `Fecha ${dataCurtaDoDia(dia)}` : dia.split("-").reverse().join("/");
    }
    case "naEtapaHa":
      return textoDoTempoNaEtapa(deal, ctx.agora, curto);
    case "criadoEm":
      return curto ? `Criado ${dataCurta(deal.createdAt)}` : dataCompleta(deal.createdAt);
    case "contato":
      return contato?.name || "";
    case "telefone":
      return contato?.phone || "";
    case "email":
      return contato?.email || "";
    case "produtos":
      return resumoDosProdutos(deal.produtos ?? []);
    default:
      return "";
  }
}
