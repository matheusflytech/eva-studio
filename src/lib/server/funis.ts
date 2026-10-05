import "server-only";
import { CORES_DE_ETAPA } from "@/lib/custom-fields";

// Regras compartilhadas das rotas de funil e etapa.

export const MAX_ETAPAS = 20;
export const MAX_FUNIS = 15;
export const TIPOS_DE_ETAPA = ["open", "won", "lost"] as const;

export function tipoValido(v: unknown): "open" | "won" | "lost" {
  return (TIPOS_DE_ETAPA as readonly string[]).includes(String(v)) ? (String(v) as "open" | "won" | "lost") : "open";
}

export function corValida(v: unknown): string {
  return (CORES_DE_ETAPA as readonly string[]).includes(String(v)) ? String(v) : "";
}

export function probabilidade(v: unknown, tipo: string): number {
  // Ganho vale 100 e perdido vale 0, sempre: previsão ponderada não pode
  // contar uma etapa de perda como chance de venda.
  if (tipo === "won") return 100;
  if (tipo === "lost") return 0;
  return Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
}

/** Escolhe a etapa de destino de um funil por nome, depois por tipo, depois a primeira aberta. */
export function etapaEquivalente<T extends { id: string; name: string; type: string }>(
  destino: T[],
  origem: { name: string; type: string }
): T {
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    destino.find((e) => norm(e.name) === norm(origem.name)) ??
    (origem.type !== "open" ? destino.find((e) => e.type === origem.type) : undefined) ??
    destino.find((e) => e.type === "open") ??
    destino[0]
  );
}
