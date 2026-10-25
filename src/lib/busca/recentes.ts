// ---------------------------------------------------------------------------
// Recentes da paleta: registros abertos por último, guardados no navegador
// (localStorage), um por contrato e por pessoa. É conveniência: armazenamento
// bloqueado (aba anônima, política do navegador) vira lista vazia.
// ---------------------------------------------------------------------------

export const MAX_RECENTES = 8;
export const TIPOS_DE_RECENTE = ["negocio", "contato", "empresa"] as const;
export type TipoDeRecente = (typeof TIPOS_DE_RECENTE)[number];

export interface Recente {
  tipo: TipoDeRecente;
  id: string;
  titulo: string;
  /** Caminho de tela SEM o contrato (/deals/1, /contacts?open=2; os antigos, em português, o proxy traduz). */
  caminho: string;
  subtitulo?: string;
}

interface Armazenamento {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function chaveDosRecentes(contrato: string, userId: string): string {
  return `eva_busca_recentes:${contrato}:${userId}`;
}

export function registrarRecente(lista: readonly Recente[], item: Recente): Recente[] {
  return [item, ...lista.filter((x) => !(x.tipo === item.tipo && x.id === item.id))].slice(0, MAX_RECENTES);
}

function valido(x: unknown): x is Recente {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    TIPOS_DE_RECENTE.includes(r.tipo as TipoDeRecente) &&
    typeof r.id === "string" &&
    typeof r.titulo === "string" &&
    typeof r.caminho === "string" &&
    // Só caminho de tela do app ("//outro.site" não).
    /^\/(?![/\\])/.test(r.caminho)
  );
}

export function lerRecentes(s: Armazenamento | null | undefined, chave: string): Recente[] {
  if (!s) return [];
  try {
    const bruto = JSON.parse(s.getItem(chave) ?? "[]");
    return Array.isArray(bruto) ? bruto.filter(valido).slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

export function gravarRecente(s: Armazenamento | null | undefined, chave: string, item: Recente): Recente[] {
  const lista = registrarRecente(lerRecentes(s, chave), item);
  try {
    s?.setItem(chave, JSON.stringify(lista));
  } catch {
    /* armazenamento bloqueado: fica só na memória desta vez */
  }
  return lista;
}
