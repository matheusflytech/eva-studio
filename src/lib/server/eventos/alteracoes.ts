import "server-only";
import { publicarEvento } from "./barramento";

// ---------------------------------------------------------------------------
// "Campo alterado": foto do registro antes, foto depois (formato da API v1),
// e o evento `<objeto>.updated` só com o que mudou de fato. É o que deixa o
// gatilho "Campo alterado" casar pelo nome do campo e o webhook mandar
// `previous`. Responsável mudou: também `deal.owner_changed`.
// ---------------------------------------------------------------------------

export type ObjetoComFoto = "deal" | "contact" | "company";
export type Foto = Record<string, unknown>;
export type Diff = Record<string, { de: unknown; para: unknown }>;

/** Mudam sozinhos (ou são derivados): não contam como alteração. */
const IGNORAR = new Set(["updated_at", "created_at", "last_seen_at", "external_id", "deal_count", "contact_count"]);

/** Foto no formato da API. Import tardio: os serializadores importam crm.ts, que publica eventos. */
export async function fotoDoRegistro(orgId: string, objeto: ObjetoComFoto, id: string): Promise<Foto | null> {
  try {
    if (objeto === "deal") {
      const { carregarNegocio, serializarNegocios } = await import("@/lib/server/api-v1/negocios");
      const linha = await carregarNegocio(orgId, id);
      const [d] = await serializarNegocios(orgId, [linha]);
      // A API mostra funil/etapa pelo número; automações, histórico e regras
      // salvas comparam pelo UUID interno, então a foto fica com ele.
      return { ...d, pipeline_id: linha.pipelineId, stage_id: linha.stageId } as Foto;
    }
    if (objeto === "contact") {
      const { carregarContato, serializarContatos } = await import("@/lib/server/api-v1/contatos");
      const [c] = await serializarContatos(orgId, [await carregarContato(orgId, id)]);
      return c as Foto;
    }
    const { carregarEmpresa, serializarEmpresas } = await import("@/lib/server/api-v1/empresas");
    const [e] = await serializarEmpresas(orgId, [await carregarEmpresa(orgId, id)]);
    return e as Foto;
  } catch {
    return null;
  }
}

/** Lista de { id } (etiquetas, contatos do negócio) compara pelos ids, sem ligar para a ordem. */
function normalizar(v: unknown): unknown {
  if (Array.isArray(v)) {
    const ids = v.map((x) => (x && typeof x === "object" && "id" in x ? (x as { id: unknown }).id : (x && typeof x === "object" && "contact_id" in x ? (x as { contact_id: unknown }).contact_id : x)));
    return JSON.stringify([...ids].map(String).sort());
  }
  if (v && typeof v === "object") return JSON.stringify(v);
  return v ?? null;
}

/** Diferença entre duas fotos. Campos personalizados entram um a um: `custom_fields.<chave>`. */
export function diferencas(antes: Foto, depois: Foto): Diff {
  const diff: Diff = {};
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const k of chaves) {
    if (IGNORAR.has(k)) continue;
    if (k === "custom_fields") {
      const a = (antes[k] ?? {}) as Record<string, unknown>;
      const d = (depois[k] ?? {}) as Record<string, unknown>;
      for (const ck of new Set([...Object.keys(a), ...Object.keys(d)])) {
        if (normalizar(a[ck]) !== normalizar(d[ck])) diff[`custom_fields.${ck}`] = { de: a[ck] ?? null, para: d[ck] ?? null };
      }
      continue;
    }
    if (normalizar(antes[k]) !== normalizar(depois[k])) diff[k] = { de: antes[k] ?? null, para: depois[k] ?? null };
  }
  return diff;
}

/**
 * Publica `<objeto>.updated` se algo mudou (e `deal.owner_changed` quando é o
 * caso). `antes` é a foto tirada antes de gravar; sem ela (não deu para ler),
 * não publica: melhor nenhum evento que um diff inventado.
 */
export async function publicarAlteracao(orgId: string, objeto: ObjetoComFoto, id: string, antes: Foto | null): Promise<Diff | null> {
  if (!antes) return null;
  const depois = await fotoDoRegistro(orgId, objeto, id);
  if (!depois) return null;
  const diff = diferencas(antes, depois);
  if (Object.keys(diff).length === 0) return null;
  await publicarEvento({ orgId, tipo: `${objeto}.updated`, objeto, objetoId: id, diff });
  if (objeto === "deal" && diff.owner_id) {
    await publicarEvento({ orgId, tipo: "deal.owner_changed", objeto, objetoId: id, diff: { owner_id: diff.owner_id } });
  }
  return diff;
}
