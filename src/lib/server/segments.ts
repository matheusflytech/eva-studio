import "server-only";
import { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Segmentos — público salvo, montado a partir de regras.
//
// Uma regra é { field, op, value }. O campo pode ser:
//   - coluna da ficha: name | email | phone | channel | source | optIn
//   - data: createdAt | lastSeenAt  (ops "before"/"after", valor ISO)
//   - etiqueta: tag                 (ops "has"/"not_has", valor = id da Tag)
//   - campo livre: custom:<chave>   (ops de texto, dentro do JSON customFields)
//
// A tradução vira `where` do Prisma, nunca string de SQL concatenada — é o que
// mantém isso seguro mesmo com o usuário escrevendo o nome do campo livre.
// ---------------------------------------------------------------------------

export type SegmentOp =
  | "contains"
  | "equals"
  | "not_equals"
  | "is_empty"
  | "not_empty"
  | "has"
  | "not_has"
  | "before"
  | "after"
  | "is_true"
  | "is_false";

export interface SegmentRule {
  field: string;
  op: SegmentOp;
  value?: string;
}

const TEXT_FIELDS = new Set(["name", "email", "phone", "channel", "source"]);
const DATE_FIELDS = new Set(["createdAt", "lastSeenAt"]);
const BOOL_FIELDS = new Set(["optIn"]);

function textCondition(field: string, op: SegmentOp, value: string): Prisma.ContactWhereInput | null {
  switch (op) {
    case "contains":
      return { [field]: { contains: value, mode: "insensitive" } } as Prisma.ContactWhereInput;
    case "equals":
      return { [field]: { equals: value, mode: "insensitive" } } as Prisma.ContactWhereInput;
    case "not_equals":
      return { NOT: { [field]: { equals: value, mode: "insensitive" } } } as Prisma.ContactWhereInput;
    case "is_empty":
      return { [field]: "" } as Prisma.ContactWhereInput;
    case "not_empty":
      return { NOT: { [field]: "" } } as Prisma.ContactWhereInput;
    default:
      return null;
  }
}

function ruleToWhere(rule: SegmentRule): Prisma.ContactWhereInput | null {
  const value = (rule.value ?? "").trim();

  if (rule.field === "tag") {
    if (!value) return null;
    if (rule.op === "has") return { tags: { some: { tagId: value } } };
    if (rule.op === "not_has") return { tags: { none: { tagId: value } } };
    return null;
  }

  if (rule.field.startsWith("custom:")) {
    const key = rule.field.slice("custom:".length);
    if (!key) return null;
    // Prisma filtra JSON por caminho. `string_contains` cobre "contém" e
    // `equals` cobre igualdade exata; vazio/não-vazio viram presença da chave.
    switch (rule.op) {
      case "contains":
        return { customFields: { path: [key], string_contains: value } };
      case "equals":
        return { customFields: { path: [key], equals: value } };
      case "not_equals":
        return { NOT: { customFields: { path: [key], equals: value } } };
      case "not_empty":
        return { NOT: { customFields: { path: [key], equals: Prisma.DbNull } } } as Prisma.ContactWhereInput;
      case "is_empty":
        return { customFields: { path: [key], equals: Prisma.DbNull } } as Prisma.ContactWhereInput;
      default:
        return null;
    }
  }

  if (TEXT_FIELDS.has(rule.field)) return textCondition(rule.field, rule.op, value);

  if (DATE_FIELDS.has(rule.field)) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (rule.op === "before") return { [rule.field]: { lt: date } } as Prisma.ContactWhereInput;
    if (rule.op === "after") return { [rule.field]: { gt: date } } as Prisma.ContactWhereInput;
    return null;
  }

  if (BOOL_FIELDS.has(rule.field)) {
    if (rule.op === "is_true") return { [rule.field]: true } as Prisma.ContactWhereInput;
    if (rule.op === "is_false") return { [rule.field]: false } as Prisma.ContactWhereInput;
    return null;
  }

  return null; // campo desconhecido: ignora a regra em vez de quebrar a consulta
}

/**
 * Traduz as regras de um segmento no `where` do Prisma, já preso ao agente.
 *
 * Regra inválida é descartada silenciosamente (campo que não existe mais,
 * etiqueta apagada). Se sobrar zero regra válida, devolve só o filtro do
 * agente — um segmento vazio é "todo mundo", que é o comportamento menos
 * surpreendente na hora de montar um disparo.
 */
export function buildSegmentWhere(
  orgId: string,
  match: string,
  rules: SegmentRule[]
): Prisma.ContactWhereInput {
  const conditions = rules.map(ruleToWhere).filter((c): c is Prisma.ContactWhereInput => c !== null);
  if (conditions.length === 0) return { orgId };
  return match === "any" ? { orgId, OR: conditions } : { orgId, AND: conditions };
}

export function parseRules(raw: unknown): SegmentRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is SegmentRule => !!r && typeof r === "object" && typeof (r as SegmentRule).field === "string"
  );
}

