import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ErroApi, corpoDeLista } from "./http";
import { SOURCE_PADRAO } from "./entrada";
import { lerConsulta, lerDataDaConsulta, paginar } from "./paginacao";

// ---------------------------------------------------------------------------
// Id externo (o id do registro no sistema de quem integra) e lápide de
// exclusão. Moram em tabelas próprias para não mexer em Contact/Company/Deal,
// que as telas e o motor do fluxo usam o tempo todo.
// ---------------------------------------------------------------------------

export type EntidadeExterna = "contact" | "company" | "deal";

export async function idPorExterno(
  orgId: string,
  entity: EntidadeExterna,
  externalId: string,
  source = SOURCE_PADRAO
): Promise<string | null> {
  const ref = await prisma.externalRef.findUnique({
    where: { orgId_entity_source_externalId: { orgId, entity, source, externalId } },
    select: { entityId: true },
  });
  return ref?.entityId ?? null;
}

/**
 * Liga (ou troca, ou remove com null) o id externo de um registro. Um id
 * externo que já é de OUTRO registro é conflito: aceitar trocaria o dono em
 * silêncio e a próxima sincronização atualizaria a ficha errada.
 */
export async function vincularExterno(
  orgId: string,
  entity: EntidadeExterna,
  entityId: string,
  externalId: string | null,
  source = SOURCE_PADRAO
): Promise<void> {
  if (externalId === null) {
    await prisma.externalRef.deleteMany({ where: { orgId, entity, source, entityId } });
    return;
  }
  const dono = await idPorExterno(orgId, entity, externalId, source);
  if (dono && dono !== entityId) {
    throw new ErroApi(409, "external_id_taken", `O external_id ${externalId} já pertence a outro registro.`, {
      param: "external_id",
      details: { existing_id: dono },
    });
  }
  if (dono === entityId) return;
  await prisma.externalRef.upsert({
    where: { orgId_entity_source_entityId: { orgId, entity, source, entityId } },
    create: { orgId, entity, source, entityId, externalId },
    update: { externalId },
  });
}

/** external_id de cada registro da página (uma consulta só). */
export async function externosDe(
  orgId: string,
  entity: EntidadeExterna,
  ids: string[],
  source = SOURCE_PADRAO
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const refs = await prisma.externalRef.findMany({
    where: { orgId, entity, source, entityId: { in: ids } },
    select: { entityId: true, externalId: true },
  });
  return new Map(refs.map((r) => [r.entityId, r.externalId]));
}

export function serializarExclusao(r: { entityId: string; externalId: string; deletedAt: Date; id: string }) {
  return { id: r.entityId, external_id: r.externalId || null, deleted_at: r.deletedAt.toISOString() };
}

/** GET /v1/<entidade>/deleted?since= — o que sumiu, para a sincronização apagar do outro lado. */
export async function respostaDeExcluidos(orgId: string, entity: EntidadeExterna, url: URL) {
  const sp = lerConsulta(url, ["since"]);
  const desde = lerDataDaConsulta(sp, "since");
  const where = { orgId, entity, ...(desde ? { deletedAt: { gte: desde } } : {}) };
  const pagina = await paginar({
    sp,
    campo: "deletedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.deletedRecord.findMany({ where: cursor ? { AND: [where, cursor] } : where, take, orderBy }),
    contar: () => prisma.deletedRecord.count({ where }),
  });
  return NextResponse.json(corpoDeLista(pagina.itens.map(serializarExclusao), pagina));
}
