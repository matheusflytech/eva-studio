import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { ROLE_BY_STAGE_NAME, ROLE_LABELS, type ProductConfig, type StageRole } from "@/lib/hotmart/types";
import { compatible, hotmartFields, targetKey, type FieldMap } from "@/lib/hotmart/fields";
import { gerarChaveUnica } from "@/lib/server/custom-fields";

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
export async function saveConnection(orgId: string, input: { hottok?: string; products?: Products; fields?: FieldMap; status?: "active" | "paused" }) {
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
      ...(input.fields ? { fields: input.fields as object } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

/** Valor do painel que pede para criar o campo padrão. */
export const CREATE_FIELD = "+new";

/**
 * Resolve as escolhas do painel (dado -> "+new" | chave de campo | "" para não
 * gravar) num mapa salvo. Cria os campos pedidos que faltam (e os obrigatórios
 * da regra, mesmo sem escolha) e completa as opções das listas de destino.
 * Escolha que não dá para aplicar vira erro com o nome do dado.
 */
export async function resolveFieldMap(orgId: string, saved: FieldMap, raw: unknown, products: Products): Promise<{ map: FieldMap; errors: string[] }> {
  const choices = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const catalog = hotmartFields(products);
  const defs = await prisma.customField.findMany({ where: { orgId, pipelineId: null }, select: { id: true, entity: true, key: true, type: true, options: true } });
  const count = { contact: 0, deal: 0 } as Record<string, number>;
  for (const e of ["contact", "deal"]) count[e] = await prisma.customField.count({ where: { orgId, entity: e } });
  const find = (entity: string, key: string | null) => (key ? defs.find((d) => d.entity === entity && d.key === key) : undefined);
  const map: FieldMap = { ...saved };
  const errors: string[] = [];
  // Campos que a regra lê de volta (evento repetido) não recebem outro dado.
  const reserved = new Set(catalog.filter((f) => f.required).map((f) => targetKey(map, f.id)));

  for (const f of catalog) {
    const v = choices[f.id];
    let choice = typeof v === "string" ? v : undefined;
    // Obrigatório sem campo: cria, mesmo que ninguém tenha aberto a seção Campos.
    if (f.required && (choice === "" || (choice === undefined && !find(f.entity, targetKey(map, f.id))))) choice = CREATE_FIELD;
    // Essencial nunca escolhido e sem campo de mesma chave: cria também (o
    // padrão da seção Campos). "Não gravar" já salvo fica no mapa e não volta.
    if (f.essential && choice === undefined && !(f.id in map) && !find(f.entity, f.id)) choice = CREATE_FIELD;
    if (choice === undefined) continue;
    if (choice === "") { map[f.id] = null; continue; }
    if (choice !== CREATE_FIELD) {
      const d = find(f.entity, choice);
      if (d && compatible(f.type, d.type) && (f.required || !reserved.has(d.key))) map[f.id] = d.key;
      else errors.push(`${f.label}: o campo escolhido não existe ou é de outro tipo.`);
      continue;
    }
    const same = find(f.entity, f.id);
    if (same && compatible(f.type, same.type)) { map[f.id] = same.key; continue; }
    // Chave a partir do id padrão (não do rótulo): o mesmo nome em todo contrato.
    const key = await gerarChaveUnica(orgId, f.entity, f.id);
    const created = await prisma.customField.create({
      data: { orgId, entity: f.entity, key, label: f.label, type: f.type, options: (f.options ?? []) as object, position: count[f.entity] },
      select: { id: true, entity: true, key: true, type: true, options: true },
    });
    count[f.entity] += 1;
    defs.push(created);
    map[f.id] = key;
  }

  // Lista de destino sem a opção que a regra grava descartaria o valor.
  for (const f of catalog) {
    const d = f.options && find(f.entity, targetKey(map, f.id));
    if (!d || (d.type !== "select" && d.type !== "multiselect")) continue;
    const current = Array.isArray(d.options) ? (d.options as { value: string; label: string }[]) : [];
    const labels = new Set(current.map((o) => o.label.toLowerCase()));
    const missing = f.options!.filter((o) => !current.some((x) => x.value === o.value)).map((o) => (labels.has(o.label.toLowerCase()) ? { ...o, label: `${o.label} (${o.value})` } : o));
    if (missing.length) await prisma.customField.update({ where: { id: d.id }, data: { options: [...current, ...missing] as object } });
  }
  return { map, errors };
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
