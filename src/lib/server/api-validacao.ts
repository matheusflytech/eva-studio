import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Peças comuns às rotas do CRM: ler o corpo sem estourar 500 com JSON
 * inválido, validar datas e valores, conferir que ids vindos do corpo
 * pertencem à organização e traduzir erros conhecidos do Prisma.
 */

export type Corpo = Record<string, unknown>;

export function erro(mensagem: string, status = 400) {
  return NextResponse.json({ error: mensagem }, { status });
}

/** Corpo como objeto, ou null se não for JSON de objeto. */
export async function lerCorpo(request: Request): Promise<Corpo | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Corpo;
}

export const JSON_INVALIDO = "Corpo da requisição inválido: envie um objeto JSON.";

/** Maior valor em centavos que cabe na coluna Int (≈ R$ 21,4 milhões). */
export const MAX_CENTAVOS = 2_147_483_647;

/**
 * Valor em reais (número ou texto "1500,50" / "1.500,50" / "1500.50") para
 * centavos. undefined = campo não veio; null = valor inválido.
 */
export function reaisParaCentavos(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return 0;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") n = parseReais(v);
  else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  const c = Math.round(n * 100);
  return c > MAX_CENTAVOS ? null : c;
}

/** "R$ 1.500,50" → 1500.5; "1500.50" → 1500.5; "1.500" → 1500. NaN se inválido. */
export function parseReais(texto: string): number {
  let s = texto.replace(/R\$|\s/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    // Vírgula é o decimal; pontos são milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.500" ou "1.500.000": só separadores de milhar.
    s = s.replace(/\./g, "");
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Data opcional. undefined = não veio; null = limpar; "invalida" = rejeitar.
 * "AAAA-MM-DD" vira meio-dia UTC, para cair no mesmo dia em qualquer fuso
 * do Brasil.
 */
export function dataOpcional(v: unknown): Date | null | undefined | "invalida" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number") return "invalida";
  const texto = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00Z`) : new Date(texto);
  if (Number.isNaN(d.getTime())) return "invalida";
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    // Recusa 2026-02-31 (o JS rola para março sem avisar).
    const [a, m, dia] = texto.slice(0, 10).split("-").map(Number);
    const conferida = new Date(Date.UTC(a, m - 1, dia));
    if (conferida.getUTCMonth() !== m - 1 || conferida.getUTCDate() !== dia) return "invalida";
  }
  return d;
}

/** Inteiro dentro de [min, max], ou null se não for número. */
export function inteiroEntre(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Texto aparado e cortado; undefined se não veio, "" se veio vazio. */
export function texto(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return v === null ? "" : undefined;
  return String(v).trim().slice(0, max);
}

type Referencias = {
  contactId?: unknown;
  companyId?: unknown;
  ownerId?: unknown;
  assignedToId?: unknown;
  dealId?: unknown;
  agentId?: unknown;
  stageId?: unknown;
  pipelineId?: unknown;
};

const NOMES: Record<keyof Referencias, string> = {
  contactId: "Contato",
  companyId: "Empresa",
  ownerId: "Responsável",
  assignedToId: "Responsável",
  dealId: "Negócio",
  agentId: "Agente",
  stageId: "Etapa",
  pipelineId: "Funil",
};

/**
 * Confere que cada id informado (string não vazia) existe na organização.
 * Devolve a mensagem de erro do primeiro que falhar, ou null se tudo ok.
 * Ids null/""/undefined são ignorados (significam "sem vínculo").
 */
export async function conferirReferencias(orgId: string, refs: Referencias): Promise<string | null> {
  const checagens: Array<[keyof Referencias, Promise<unknown>]> = [];
  for (const [campo, valor] of Object.entries(refs) as Array<[keyof Referencias, unknown]>) {
    if (valor === undefined || valor === null || valor === "") continue;
    if (typeof valor !== "string") return `${NOMES[campo]} inválido.`;
    const id = valor;
    const select = { select: { id: true } } as const;
    let q: Promise<unknown>;
    switch (campo) {
      case "contactId":
        q = prisma.contact.findFirst({ where: { id, orgId }, ...select });
        break;
      case "companyId":
        q = prisma.company.findFirst({ where: { id, orgId }, ...select });
        break;
      case "ownerId":
      case "assignedToId":
        q = prisma.profile.findFirst({ where: { id, orgId }, ...select });
        break;
      case "dealId":
        q = prisma.deal.findFirst({ where: { id, orgId }, ...select });
        break;
      case "agentId":
        q = prisma.agent.findFirst({ where: { id, orgId }, ...select });
        break;
      case "stageId":
        q = prisma.pipelineStage.findFirst({ where: { id, pipeline: { orgId } }, ...select });
        break;
      case "pipelineId":
        q = prisma.pipeline.findFirst({ where: { id, orgId }, ...select });
        break;
    }
    checagens.push([campo, q]);
  }
  const resultados = await Promise.all(checagens.map(([, q]) => q));
  const falhou = checagens.findIndex((_, i) => !resultados[i]);
  return falhou === -1 ? null : `${NOMES[checagens[falhou][0]]} não encontrado nesta organização.`;
}

/** Traduz erros conhecidos do Prisma em resposta HTTP; relança o resto. */
export function respostaDeErroDoPrisma(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return erro("Já existe um registro com esses dados.", 409);
    if (e.code === "P2025") return erro("Registro não encontrado.", 404);
    if (e.code === "P2003") return erro("Referência inválida: um dos ids informados não existe.", 400);
  }
  throw e;
}
