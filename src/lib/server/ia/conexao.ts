import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm-providers";
import { escolherProvedorDeIa } from "@/lib/server/ia/provedor";
import type { PassoDeIa } from "@/lib/server/ia/reserva";

// ---------------------------------------------------------------------------
// Conexão de IA do contrato (Central de IA).
//
// Uma lista só, em ordem de preferência, que todos os blocos de IA marcados
// com "Conexão do contrato" usam: [chave A + modelo X, chave B + modelo Y...].
// Na hora de responder, src/lib/server/ia/reserva.ts tenta na ordem.
//
// Leitura tolerante: sem a tabela (SQL 2026-10-21-conexao-ia.sql ainda não
// aplicado) ou sem nada salvo, vale a escolha automática de provedor.ts (a
// chave de IA mais adequada do contrato, ou a da plataforma) — o mesmo que o
// dashboard já usava.
// ---------------------------------------------------------------------------

export interface PassoSalvo {
  credentialId: string;
  model: string;
}

export interface ConexaoDeIa {
  passos: PassoSalvo[];
  timeoutMs: number;
  /** A tabela respondeu; false = recurso ainda não ativado no banco. */
  disponivel: boolean;
}

export const TEMPO_PADRAO_MS = 25_000;
export const MAX_PASSOS = 6;

/** Limpa o que veio do banco ou da tela: só passos com credencial e modelo, sem repetir, no máximo 6. */
export function normalizarPassos(bruto: unknown): PassoSalvo[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const passos: PassoSalvo[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const credentialId = String((item as Record<string, unknown>).credentialId ?? "").trim();
    const model = String((item as Record<string, unknown>).model ?? "").trim();
    if (!credentialId || !model) continue;
    const chave = `${credentialId}|${model}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    passos.push({ credentialId, model });
    if (passos.length >= MAX_PASSOS) break;
  }
  return passos;
}

/** Tempo limite entre 5 s e 120 s; fora disso, o padrão. */
export function normalizarTempo(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isFinite(n)) return TEMPO_PADRAO_MS;
  return Math.min(120_000, Math.max(5_000, Math.round(n)));
}

export async function lerConexao(orgId: string): Promise<ConexaoDeIa> {
  try {
    const registro = await prisma.aiConnection.findUnique({ where: { orgId }, select: { passos: true, timeoutMs: true } });
    return {
      passos: normalizarPassos(registro?.passos),
      timeoutMs: registro ? normalizarTempo(registro.timeoutMs) : TEMPO_PADRAO_MS,
      disponivel: true,
    };
  } catch {
    return { passos: [], timeoutMs: TEMPO_PADRAO_MS, disponivel: false };
  }
}

/**
 * Grava a conexão. Só aceita credenciais de IA do próprio contrato: um id de
 * outra organização é descartado em silêncio, como se não existisse.
 */
export async function salvarConexao(orgId: string, passosBrutos: unknown, tempoBruto: unknown): Promise<ConexaoDeIa> {
  const pedidos = normalizarPassos(passosBrutos);
  const tipos = LLM_PROVIDERS.map((p) => p.credentialType);
  const validas = new Set(
    (
      await prisma.credential.findMany({
        where: { orgId, id: { in: pedidos.map((p) => p.credentialId) }, type: { in: tipos } },
        select: { id: true },
      })
    ).map((c) => c.id)
  );
  const passos = pedidos.filter((p) => validas.has(p.credentialId));
  const timeoutMs = normalizarTempo(tempoBruto);
  const json = passos.map((p) => ({ ...p })) as Prisma.InputJsonValue;
  await prisma.aiConnection.upsert({
    where: { orgId },
    create: { orgId, passos: json, timeoutMs },
    update: { passos: json, timeoutMs },
  });
  return { passos, timeoutMs, disponivel: true };
}

/**
 * Os passos prontos para chamar (chave decifrada), na ordem. Credencial
 * apagada ou que não decifra some da lista. Sem nenhum passo válido, a
 * escolha automática entra como único passo.
 */
export async function passosDaConexao(orgId: string): Promise<{ passos: PassoDeIa[]; timeoutMs: number }> {
  const conexao = await lerConexao(orgId);
  const passos: PassoDeIa[] = [];

  if (conexao.passos.length > 0) {
    const credenciais = await prisma.credential.findMany({
      where: { orgId, id: { in: conexao.passos.map((p) => p.credentialId) } },
      select: { id: true, name: true, type: true, secretEnc: true },
    });
    const porId = new Map(credenciais.map((c) => [c.id, c]));
    for (const p of conexao.passos) {
      const cred = porId.get(p.credentialId);
      const info = cred && LLM_PROVIDERS.find((l) => l.credentialType === cred.type);
      if (!cred || !info) continue;
      try {
        const apiKey = decryptSecret(cred.secretEnc);
        if (apiKey) passos.push({ provider: info.id as LlmProvider, apiKey, model: p.model, origem: cred.name, credentialId: cred.id });
      } catch {
        // Chave que não decifra (cifra trocada): pula para a próxima.
      }
    }
  }

  if (passos.length === 0) {
    const automatico = await escolherProvedorDeIa(orgId);
    if (automatico) {
      passos.push({
        provider: automatico.provider,
        apiKey: automatico.apiKey,
        model: automatico.model,
        origem: automatico.origem === "plataforma" ? "plataforma" : "automática",
        credentialId: automatico.credentialId ?? null,
      });
    }
  }

  return { passos, timeoutMs: conexao.timeoutMs };
}
