import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { ROLE_BY_STAGE_NAME, ROLE_LABELS, type ProductConfig, type StageRole } from "@/lib/hotmart/types";

// Conexão Hotmart de um contrato: token da URL, hottok cifrado e o mapa
// produto -> funil -> papel de cada etapa.

export type Products = Record<string, ProductConfig>;

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function suggestStages(stages: { id: string; name: string }[]): Partial<Record<StageRole, string>> {
  const r: Partial<Record<StageRole, string>> = {};
  for (const s of stages) {
    const role = ROLE_BY_STAGE_NAME[plain(s.name)];
    if (role && !r[role]) r[role] = s.id;
  }
  return r;
}

export async function getConnection(orgId: string) {
  return prisma.hotmartConnection.findUnique({ where: { orgId } });
}

export async function connectionByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  return prisma.hotmartConnection.findUnique({ where: { token } });
}

export function hottokOf(secrets: string): string {
  try {
    return String(JSON.parse(decryptSecret(secrets) || "{}").hottok ?? "");
  } catch {
    return "";
  }
}

/** Compara em tempo constante (hash dos dois lados: tamanho diferente não vaza). */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

/** Cria (ou atualiza) a conexão. hottok vazio = mantém o atual. */
export async function saveConnection(orgId: string, input: { hottok?: string; products?: Products; status?: "active" | "paused" }) {
  const secrets = input.hottok ? encryptSecret(JSON.stringify({ hottok: input.hottok.trim() })) : undefined;
  return prisma.hotmartConnection.upsert({
    where: { orgId },
    create: {
      orgId,
      token: crypto.randomBytes(24).toString("base64url"),
      secrets: secrets ?? "",
      products: (input.products ?? {}) as object,
      status: input.status ?? "active",
    },
    update: {
      ...(secrets ? { secrets } : {}),
      ...(input.products ? { products: input.products as object } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

/** Produtos vindos do painel, conferindo que funil e etapas são deste contrato. */
export async function validateProducts(orgId: string, raw: unknown): Promise<Products> {
  if (!raw || typeof raw !== "object") return {};
  const pipelines = await prisma.pipeline.findMany({ where: { orgId }, select: { id: true, stages: { select: { id: true } } } });
  const stagesOf = new Map(pipelines.map((p) => [p.id, new Set(p.stages.map((s) => s.id))]));
  const out: Products = {};
  for (const [id, p] of Object.entries(raw as Record<string, Partial<ProductConfig>>)) {
    if (!/^\d{1,20}$/.test(id) || !p || typeof p.pipelineId !== "string" || !stagesOf.has(p.pipelineId)) continue;
    const valid = stagesOf.get(p.pipelineId)!;
    const stages: Partial<Record<StageRole, string>> = {};
    for (const [role, stageId] of Object.entries(p.stages ?? {})) {
      if (role in ROLE_LABELS && typeof stageId === "string" && valid.has(stageId)) stages[role as StageRole] = stageId;
    }
    out[id] = {
      slug: String(p.slug ?? "").toLowerCase().slice(0, 40).replace(/[^a-z0-9-]/g, "") || id,
      name: String(p.name ?? "").trim().slice(0, 120) || id,
      model: p.model === "subscription" ? "subscription" : "one_time",
      pipelineId: p.pipelineId,
      stages,
    };
  }
  return out;
}
