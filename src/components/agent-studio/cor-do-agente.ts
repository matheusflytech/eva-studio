import * as React from "react";
import { corPorHash } from "@/components/inbox/tipos";
import type { CategoryColor } from "@/lib/design-system/tokens";

// ---------------------------------------------------------------------------
// Cor da orbe de cada agente. Sem escolha, a cor sai do id (a mesma do antigo
// quadrado com inicial, via `corPorHash`); com escolha, fica no navegador.
//
// Os valores são hex porque o canvas da orbe precisa dos números: não dá para
// pintar partícula com classe de token. Os da paleta seguem as cores de
// categoria da v5 (--cat-*-solid do tema escuro, que brilham nos dois temas)
// mais o azul da Eva.
//
// Guardar no banco (campo no agente) é decisão pendente do dono: por enquanto
// a escolha mora só no localStorage deste navegador.
// ---------------------------------------------------------------------------

export interface CorDaPaleta {
  nome: string;
  hex: string;
}

export const PALETA_DA_ORBE: CorDaPaleta[] = [
  { nome: "Azul Eva", hex: "#1f6fd6" },
  { nome: "Céu", hex: "#4f9cf3" },
  { nome: "Ciano", hex: "#22b8d8" },
  { nome: "Turquesa", hex: "#25b5a6" },
  { nome: "Verde", hex: "#38b26f" },
  { nome: "Âmbar", hex: "#e3a23a" },
  { nome: "Laranja", hex: "#f08240" },
  { nome: "Rosa", hex: "#dc2f5f" },
  { nome: "Violeta", hex: "#8257e8" },
  { nome: "Grafite", hex: "#8c9bb0" },
];

/** Hex de cada cor de identidade (o que `corPorHash` pode devolver). */
const HEX_DA_CATEGORIA: Record<CategoryColor, string> = {
  slate: "#8c9bb0",
  blue: "#4f9cf3",
  cyan: "#22b8d8",
  teal: "#25b5a6",
  green: "#38b26f",
  amber: "#e3a23a",
  orange: "#f08240",
  red: "#ec6262",
  rose: "#dc2f5f",
  violet: "#8257e8",
  purple: "#a24fd0",
  indigo: "#5f63e8",
};

/** Cor padrão do agente: estável para o mesmo id. */
export function corPadraoDoAgente(id: string): string {
  return HEX_DA_CATEGORIA[corPorHash(id)];
}

/** Aceita "#abc", "abc", "#aabbcc" ou "aabbcc"; devolve "#aabbcc" ou null. */
export function normalizarHex(valor: string): string | null {
  const v = valor.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
}

export function hexParaRgb(hex: string): [number, number, number] {
  const h = normalizarHex(hex) ?? "#1f6fd6";
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const chaveDaCor = (id: string) => `eva.agente.cor.${id}`;

// --- Loja: localStorage + aviso às outras orbes da página -------------------

const EVENTO = "eva:cor-do-agente";
// Se o navegador bloquear o localStorage, a escolha vale ao menos nesta aba.
const memoria = new Map<string, string | null>();

function ler(id: string): string | null {
  try {
    const v = window.localStorage.getItem(chaveDaCor(id));
    return v ? normalizarHex(v) : null;
  } catch {
    return memoria.get(id) ?? null;
  }
}

/** Grava (ou apaga, com null) a cor do agente e avisa quem estiver olhando. */
export function definirCorDoAgente(id: string, hex: string | null) {
  const valor = hex === null ? null : normalizarHex(hex);
  if (hex !== null && !valor) return;
  memoria.set(id, valor);
  try {
    if (valor) window.localStorage.setItem(chaveDaCor(id), valor);
    else window.localStorage.removeItem(chaveDaCor(id));
  } catch {
    // sem armazenamento: fica só na memória
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { id } }));
}

function assinar(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener("storage", aoMudar); // outras abas
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/**
 * Cor da orbe do agente. `personalizada` diz se veio de uma escolha;
 * `definir(null)` volta ao padrão. Todas as orbes do mesmo agente na página
 * mudam juntas.
 */
export function useCorDoAgente(id: string) {
  const escolhida = React.useSyncExternalStore(
    assinar,
    () => ler(id),
    () => null
  );
  const definir = React.useCallback((hex: string | null) => definirCorDoAgente(id, hex), [id]);
  return {
    cor: escolhida ?? corPadraoDoAgente(id),
    personalizada: escolhida !== null,
    definir,
  };
}
