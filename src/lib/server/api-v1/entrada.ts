import "server-only";
import { dataOpcional, type Corpo } from "@/lib/server/api-validacao";
import { ErroApi } from "./http";

// ---------------------------------------------------------------------------
// Leitura do corpo na v1. Regra do PATCH parcial de verdade (a dor do Beeno):
// chave AUSENTE não muda nada; `null` limpa. Cada erro aponta o campo em
// `param`, para quem integra saber exatamente o que corrigir.
// ---------------------------------------------------------------------------

const erroDeCampo = (campo: string, mensagem: string) => new ErroApi(400, "invalid_parameter", mensagem, { param: campo });

/** Campo do corpo que ninguém conhece é erro: pega `externalId` mandado no lugar de `external_id`. */
export function conferirCampos(corpo: Corpo, permitidos: readonly string[]): void {
  const aceitos = new Set(permitidos);
  for (const chave of Object.keys(corpo)) {
    if (!aceitos.has(chave)) {
      throw new ErroApi(400, "unknown_field", `Campo desconhecido: ${chave}.`, { param: chave, details: { allowed: permitidos } });
    }
  }
}

/** Texto: undefined = não veio; null vira "" (limpar). Número vira texto. */
export function textoOpc(corpo: Corpo, campo: string, max: number): string | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (v === null) return "";
  if (typeof v !== "string" && typeof v !== "number") throw erroDeCampo(campo, `${campo} precisa ser texto.`);
  return String(v).trim().slice(0, max);
}

export function textoObrig(corpo: Corpo, campo: string, max: number): string {
  const t = textoOpc(corpo, campo, max);
  if (!t) throw erroDeCampo(campo, `${campo} é obrigatório.`);
  return t;
}

/** Id de vínculo: undefined = não veio; null (ou "") = desvincular. */
export function idOpc(corpo: Corpo, campo: string): string | null | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 200) throw erroDeCampo(campo, `${campo} precisa ser um id (texto).`);
  return v.trim();
}

export function boolOpc(corpo: Corpo, campo: string): boolean | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw erroDeCampo(campo, `${campo} precisa ser true ou false.`);
  return v;
}

export function inteiroOpc(corpo: Corpo, campo: string, min: number, max: number): number | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw erroDeCampo(campo, `${campo} precisa ser um inteiro entre ${min} e ${max}.`);
  }
  return v;
}

/** Data ISO-8601 ou AAAA-MM-DD. undefined = não veio; null = limpar. */
export function dataOpc(corpo: Corpo, campo: string): Date | null | undefined {
  const d = dataOpcional(corpo[campo]);
  if (d === "invalida") throw erroDeCampo(campo, `${campo} precisa ser uma data ISO-8601.`);
  return d;
}

export function objetoOpc(corpo: Corpo, campo: string): Record<string, unknown> | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw erroDeCampo(campo, `${campo} precisa ser um objeto.`);
  return v as Record<string, unknown>;
}

export function listaDeIdsOpc(corpo: Corpo, campo: string, max = 100): string[] | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200)) {
    throw erroDeCampo(campo, `${campo} precisa ser uma lista de até ${max} ids.`);
  }
  return [...new Set(v as string[])];
}

export function enumOpc<T extends string>(corpo: Corpo, campo: string, valores: readonly T[]): T | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !(valores as readonly string[]).includes(v)) {
    throw erroDeCampo(campo, `${campo} precisa ser um de: ${valores.join(", ")}.`);
  }
  return v as T;
}

/** Id externo: texto curto e sem espaço nas pontas. null = remover o vínculo. */
export function externalIdOpc(corpo: Corpo, campo = "external_id"): string | null | undefined {
  const v = corpo[campo];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if ((typeof v !== "string" && typeof v !== "number") || String(v).trim().length > 255 || !String(v).trim()) {
    throw erroDeCampo(campo, `${campo} precisa ser texto de até 255 caracteres.`);
  }
  return String(v).trim();
}

export const SOURCE_PADRAO = "api";

export function sourceOpc(corpo: Corpo): string {
  const v = corpo.external_source;
  if (v === undefined || v === null || v === "") return SOURCE_PADRAO;
  if (typeof v !== "string" || !/^[a-z0-9_.-]{1,40}$/i.test(v)) {
    throw erroDeCampo("external_source", "external_source precisa ter até 40 letras, números, _ . ou -.");
  }
  return v.toLowerCase();
}
