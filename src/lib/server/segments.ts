import "server-only";
import { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Segmentos — público salvo, montado a partir de regras.
//
// Uma regra é { field, op, value }. O campo pode ser:
//   - coluna da ficha: name | email | phone | source | optIn
//   - canal: channel                (ops "equals"/"not_equals", via ContactChannel)
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

// `channel` NÃO é coluna de Contact: o canal mora em ContactChannel (relação
// `channels`). Tratar como coluna gerava PrismaClientValidationError (500).
const TEXT_FIELDS = new Set(["name", "email", "phone", "source"]);
const DATE_FIELDS = new Set(["createdAt", "lastSeenAt"]);
const BOOL_FIELDS = new Set(["optIn"]);

/** Where que nunca casa: regra inválida não pode virar "todo mundo". */
export const WHERE_IMPOSSIVEL: Prisma.ContactWhereInput = { id: { in: [] } };

const OPS_SEM_VALOR = new Set<SegmentOp>(["is_empty", "not_empty", "is_true", "is_false"]);

function textCondition(field: string, op: SegmentOp, value: string): Prisma.ContactWhereInput | null {
  if (!OPS_SEM_VALOR.has(op) && !value) return null;
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

function channelCondition(op: SegmentOp, value: string): Prisma.ContactWhereInput | null {
  if (!value) return null;
  if (op === "equals") return { channels: { some: { channel: value } } };
  if (op === "not_equals") return { channels: { none: { channel: value } } };
  return null;
}

/**
 * Campo livre (JSON). SQL conferido no Prisma 7: `path + equals: AnyNull` vira
 * `(#>path) = 'null' OR (#>path) IS NULL`, ou seja, pega chave ausente e null
 * JSON; `string_contains` aceita `mode: "insensitive"` (LOWER ... LIKE).
 */
function customCondition(key: string, op: SegmentOp, value: string): Prisma.ContactWhereInput | null {
  const vazio: Prisma.ContactWhereInput = {
    OR: [
      { customFields: { path: [key], equals: Prisma.AnyNull } },
      { customFields: { path: [key], equals: "" } },
    ],
  };
  if (!OPS_SEM_VALOR.has(op) && !value) return null;
  switch (op) {
    case "contains":
      return { customFields: { path: [key], string_contains: value, mode: "insensitive" } };
    case "equals":
      return { customFields: { path: [key], equals: value } };
    case "not_equals":
      // Sem a chave também é "diferente de" (NOT sobre NULL não casaria).
      return {
        OR: [
          { NOT: { customFields: { path: [key], equals: value } } },
          { customFields: { path: [key], equals: Prisma.AnyNull } },
        ],
      };
    case "is_empty":
      return vazio;
    case "not_empty":
      return { NOT: vazio };
    default:
      return null;
  }
}

function ruleToWhere(rule: SegmentRule): Prisma.ContactWhereInput | null {
  const value = String(rule.value ?? "").trim();

  if (rule.field === "tag") {
    if (!value) return null;
    if (rule.op === "has") return { tags: { some: { tagId: value } } };
    if (rule.op === "not_has") return { tags: { none: { tagId: value } } };
    return null;
  }

  if (rule.field === "channel") return channelCondition(rule.op, value);

  if (rule.field.startsWith("custom:")) {
    const key = rule.field.slice("custom:".length).trim();
    if (!key) return null;
    return customCondition(key, rule.op, value);
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

  return null; // campo desconhecido
}

/**
 * Erros das regras, em português, um por regra inválida (vazio = tudo ok).
 * POST/PATCH de segmento usam isso pra responder 400 em vez de salvar um
 * segmento que, na prática, pegaria todo mundo.
 */
export function validarRegras(rules: SegmentRule[]): string[] {
  const erros: string[] = [];
  rules.forEach((r, i) => {
    if (ruleToWhere(r) === null) erros.push(`Regra ${i + 1} inválida: confira o campo, a condição e o valor.`);
  });
  return erros;
}

/**
 * Traduz as regras de um segmento no `where` do Prisma, já preso à org.
 *
 * Sem regra nenhuma, o segmento é "todo mundo" (é o que a tela promete).
 * Regra inválida (etiqueta vazia, campo que não existe mais) NUNCA alarga o
 * público: ela vira um where impossível — em "todas as regras" o segmento
 * fica vazio, em "qualquer regra" ela só não soma ninguém.
 */
export function buildSegmentWhere(
  orgId: string,
  match: string,
  rules: SegmentRule[]
): Prisma.ContactWhereInput {
  if (rules.length === 0) return { orgId };
  const conditions = rules.map((r) => ruleToWhere(r) ?? WHERE_IMPOSSIVEL);
  return match === "any" ? { orgId, OR: conditions } : { orgId, AND: conditions };
}

export function parseRules(raw: unknown): SegmentRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is SegmentRule => !!r && typeof r === "object" && typeof (r as SegmentRule).field === "string"
  );
}


/**
 * Regras vindas do corpo de POST/PATCH, ou a mensagem de erro (400). Nada é
 * descartado em silêncio: regra malformada ou inválida recusa o salvamento.
 */
export function lerRegras(bruto: unknown): SegmentRule[] | string {
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) return "As regras precisam ser uma lista.";
  const rules = parseRules(bruto);
  if (rules.length !== bruto.length) return "Há regra sem campo definido.";
  const erros = validarRegras(rules);
  return erros.length > 0 ? erros.join(" ") : rules;
}
