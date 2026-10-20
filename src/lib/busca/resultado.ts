import { formatMoney } from "@/lib/design-system/format";
import { formatarTelefone } from "@/lib/telefone";
import type { Trecho } from "./trecho";

// ---------------------------------------------------------------------------
// O que GET /api/busca devolve e como cada linha vira título + subtítulo.
// Puro: o servidor monta, a paleta só desenha.
// ---------------------------------------------------------------------------

export const TIPOS_DE_BUSCA = ["negocios", "contatos", "empresas", "notas", "mensagens"] as const;
export type TipoDeBusca = (typeof TIPOS_DE_BUSCA)[number];
/** ?tipos=a,b → os válidos, na ordem de TIPOS_DE_BUSCA; sem parâmetro = todos. */
export function lerTipos(bruto: string | null): TipoDeBusca[] {
  if (!bruto) return [...TIPOS_DE_BUSCA];
  const pedidos = bruto.split(",").map((s) => s.trim());
  return TIPOS_DE_BUSCA.filter((t) => pedidos.includes(t));
}

/** Até quantos por tipo. */
export const LIMITE_POR_TIPO = 8;

export interface RegistroEncontrado {
  tipo: "negocio" | "contato" | "empresa";
  id: string;
  titulo: string;
  subtitulo: string;
  /** Caminho de tela sem o contrato. */
  caminho: string;
  /** Contato: telefone (dígitos) e conversa, para "Enviar WhatsApp para…". */
  telefone?: string;
  /** Contato: conversa de WhatsApp mais recente. */
  conversaId?: string;
  /** Achado por semelhança (erro de digitação), não pelo começo da palavra. */
  aproximado?: boolean;
}

export interface TrechoEncontrado {
  tipo: "nota" | "mensagem";
  id: string;
  /** "Nota · Negócio Alfa" / "WhatsApp · Maria". */
  titulo: string;
  trecho: Trecho;
  caminho: string;
  quando: string;
}

export interface ResultadoDaBusca {
  negocios: RegistroEncontrado[];
  contatos: RegistroEncontrado[];
  empresas: RegistroEncontrado[];
  notas: TrechoEncontrado[];
  mensagens: TrechoEncontrado[];
  /** Como o banco buscou: com as extensões (rápido) ou no modo sem o SQL. */
  modo: { semAcento: "unaccent" | "translate"; similaridade: boolean };
  avisos: string[];
}

export const RESULTADO_VAZIO: ResultadoDaBusca = {
  negocios: [],
  contatos: [],
  empresas: [],
  notas: [],
  mensagens: [],
  modo: { semAcento: "translate", similaridade: false },
  avisos: [],
};

const juntar = (partes: (string | null | undefined)[]) => partes.map((p) => p?.trim()).filter(Boolean).join(" · ");

/** "12.345.678/0001-90" (só formata quando tem os 14 dígitos). */
export function formatarCnpj(bruto: string): string {
  const d = bruto.replace(/\D/g, "");
  if (d.length !== 14) return bruto.trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function subtituloDoNegocio(n: {
  empresa: string | null;
  etapa: string;
  amountCents: number;
  fechado?: "ganho" | "perdido" | null;
}): string {
  const valor = n.amountCents > 0 ? formatMoney(n.amountCents / 100) : null;
  const situacao = n.fechado === "ganho" ? "Ganho" : n.fechado === "perdido" ? "Perdido" : null;
  return juntar([n.empresa, situacao ?? n.etapa, valor]);
}

export function subtituloDoContato(c: { phone: string; email: string; empresa: string | null }): string {
  return juntar([c.phone ? (formatarTelefone(c.phone)?.texto ?? c.phone) : null, c.email, c.empresa]);
}

export function subtituloDaEmpresa(e: { cnpj: string; city: string; uf: string }): string {
  const lugar = e.city && e.uf ? `${e.city}/${e.uf}` : e.city || e.uf;
  return juntar([e.cnpj ? formatarCnpj(e.cnpj) : null, lugar]);
}
