import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { BulkJob, Prisma } from "@/generated/prisma/client";
import type { Corpo } from "@/lib/server/api-validacao";
import { midiaExiste, urlAssinada, urlDeUpload } from "@/lib/server/storage";
import { parseCsv } from "@/app/api/contacts/import/csv";
import { ErroApi, iso } from "./http";
import { boolOpc, conferirCampos, enumOpc, idOpc, listaDeIdsOpc, objetoOpc } from "./entrada";
import { whereDeContatos } from "./contatos";
import { whereDeNegocios } from "./negocios";

// ---------------------------------------------------------------------------
// Importação e exportação em lote (API-3): criar, consultar, cancelar.
// O processamento em fatias mora em processar-jobs.ts e roda no relógio.
//
// Estados: pending_upload → queued → processing → completed |
// completed_with_errors | failed | canceled.
// ---------------------------------------------------------------------------

export const MAX_REGISTROS_INLINE = 5000;
/** Erros guardados por job (as contagens continuam exatas além disso). */
export const MAX_ERROS_GUARDADOS = 1000;
export const ATIVOS = ["pending_upload", "queued", "processing"];
export const FINAIS = ["completed", "completed_with_errors", "failed", "canceled"];

export interface ErroDeLinha {
  row: number;
  code: string;
  message: string;
  param?: string;
  details?: unknown;
  /** O registro como foi lido: é o que o retry-failed reenvia. */
  record?: Corpo;
}

export function serializarJob(j: BulkJob, extra: Record<string, unknown> = {}) {
  const erros = Array.isArray(j.errors) ? (j.errors as unknown[]).length : 0;
  return {
    id: j.id,
    type: j.kind,
    entity: j.entity,
    status: j.status,
    format: j.format,
    ...(j.kind === "import" ? { mode: j.mode, dry_run: j.dryRun } : {}),
    options: j.options,
    total: j.total,
    processed: j.processed,
    ...(j.kind === "import"
      ? { created: j.created, updated: j.updated, unchanged: j.unchanged, failed: j.failed, errors_stored: erros }
      : {}),
    result: j.result,
    created_at: iso(j.createdAt),
    started_at: iso(j.startedAt),
    finished_at: iso(j.finishedAt),
    ...extra,
  };
}

export async function carregarJob(orgId: string, id: string, kind: "import" | "export") {
  const j = await prisma.bulkJob.findFirst({ where: { id, orgId, kind } });
  if (!j) throw new ErroApi(404, "not_found", kind === "import" ? "Importação não encontrada." : "Exportação não encontrada.");
  return j;
}

async function conferirImportAtivo(orgId: string) {
  const ativo = await prisma.bulkJob.findFirst({
    where: { orgId, kind: "import", status: { in: ATIVOS } },
    select: { id: true },
  });
  if (ativo) {
    throw new ErroApi(409, "import_in_progress", "Já existe uma importação em andamento nesta organização. Espere terminar ou cancele.", {
      details: { import_id: ativo.id },
    });
  }
}

export const CAMPOS_DE_IMPORTACAO = ["entity", "format", "records", "csv", "upload", "mode", "dry_run", "options"] as const;

/**
 * POST /v1/imports. Três jeitos de mandar os dados:
 *   - `records`: lista JSON inline (até 5 mil);
 *   - `csv`: texto CSV inline (mesmo limite de linhas);
 *   - `upload: true`: devolve `upload_url` e o arquivo vai direto para o
 *     Storage (sem o limite de 4,5 MB do corpo na Vercel); depois
 *     POST /v1/imports/{id}/start.
 */
export async function criarImportacao(orgId: string, keyId: string, corpo: Corpo) {
  conferirCampos(corpo, CAMPOS_DE_IMPORTACAO);
  const entity = enumOpc(corpo, "entity", ["contacts", "deals"] as const);
  if (!entity) throw new ErroApi(400, "invalid_parameter", "entity é obrigatório (contacts ou deals).", { param: "entity" });
  const mode = enumOpc(corpo, "mode", ["upsert", "create"] as const) ?? "upsert";
  const dryRun = boolOpc(corpo, "dry_run") ?? false;
  const upload = boolOpc(corpo, "upload") ?? false;
  const opcoes = objetoOpc(corpo, "options") ?? {};
  conferirCampos(opcoes, entity === "contacts" ? ["tag_ids"] : ["pipeline_id", "stage_id", "skip_stage_requirements"]);
  const options = {
    ...(entity === "contacts" ? { tag_ids: listaDeIdsOpc(opcoes, "tag_ids", 20) ?? [] } : {}),
    ...(entity === "deals"
      ? {
          pipeline_id: idOpc(opcoes, "pipeline_id") ?? null,
          stage_id: idOpc(opcoes, "stage_id") ?? null,
          // Flag explícita: mover negócio existente sem os campos obrigatórios
          // da etapa. Fica registrada em cada mudança de etapa (DealStageEvent).
          skip_stage_requirements: boolOpc(opcoes, "skip_stage_requirements") ?? false,
        }
      : {}),
  };
  if (entity === "contacts" && options.tag_ids?.length) {
    const achadas = await prisma.tag.count({ where: { orgId, id: { in: options.tag_ids } } });
    if (achadas !== options.tag_ids.length) throw new ErroApi(404, "invalid_reference", "Etiqueta não encontrada.", { param: "options.tag_ids" });
  }

  const fontes = [corpo.records !== undefined, corpo.csv !== undefined, upload].filter(Boolean).length;
  if (fontes !== 1) throw new ErroApi(400, "invalid_parameter", "Envie exatamente um de: records, csv ou upload: true.");

  let format = enumOpc(corpo, "format", ["json", "csv"] as const);
  let total = 0;
  let records: unknown[] | undefined;
  let inputText: string | undefined;
  if (corpo.records !== undefined) {
    if (!Array.isArray(corpo.records) || corpo.records.length === 0 || corpo.records.length > MAX_REGISTROS_INLINE) {
      throw new ErroApi(400, "invalid_parameter", `records precisa ser uma lista com 1 a ${MAX_REGISTROS_INLINE} itens.`, { param: "records" });
    }
    records = corpo.records;
    total = records.length;
    format = "json";
  } else if (corpo.csv !== undefined) {
    if (typeof corpo.csv !== "string" || !corpo.csv.trim()) throw new ErroApi(400, "invalid_parameter", "csv vazio.", { param: "csv" });
    const linhas = parseCsv(corpo.csv).length - 1;
    if (linhas < 1) throw new ErroApi(400, "invalid_csv", "O CSV precisa de um cabeçalho e pelo menos uma linha.", { param: "csv" });
    if (linhas > MAX_REGISTROS_INLINE) {
      throw new ErroApi(400, "invalid_parameter", `CSV inline aceita até ${MAX_REGISTROS_INLINE} linhas; use upload: true.`, { param: "csv" });
    }
    inputText = corpo.csv;
    total = linhas;
    format = "csv";
  } else if (!format) {
    throw new ErroApi(400, "invalid_parameter", "Com upload: true, informe format (csv ou json).", { param: "format" });
  }

  await conferirImportAtivo(orgId);

  if (upload) {
    const id = randomUUID();
    const filePath = `${orgId}/imports/${id}.${format}`;
    const destino = await urlDeUpload(filePath);
    if (!destino) throw new ErroApi(503, "storage_unavailable", "Não foi possível preparar o upload agora. Tente de novo.");
    const job = await prisma.bulkJob.create({
      data: { id, orgId, apiKeyId: keyId, kind: "import", entity, status: "pending_upload", format: format!, mode, dryRun, options, filePath },
    });
    return serializarJob(job, {
      upload_url: destino.url,
      upload_method: "PUT",
      upload_headers: { "Content-Type": format === "csv" ? "text/csv" : "application/json", "x-upsert": "true" },
    });
  }

  const job = await prisma.bulkJob.create({
    data: {
      orgId,
      apiKeyId: keyId,
      kind: "import",
      entity,
      status: "queued",
      format: format!,
      mode,
      dryRun,
      options,
      records: records as Prisma.InputJsonValue | undefined,
      inputText,
      total,
    },
  });
  return serializarJob(job);
}

/** POST /v1/imports/{id}/start — depois do upload: confere o arquivo e põe na fila. */
export async function iniciarImportacao(orgId: string, id: string) {
  const job = await carregarJob(orgId, id, "import");
  if (job.status !== "pending_upload") {
    throw new ErroApi(409, "invalid_state", `A importação está em ${job.status}; só dá para iniciar quando está pending_upload.`);
  }
  const arquivo = job.filePath ? await midiaExiste(job.filePath) : { existe: false, tamanho: 0 };
  if (!arquivo.existe) throw new ErroApi(422, "upload_missing", "O arquivo ainda não foi enviado para a upload_url.");
  const atualizado = await prisma.bulkJob.update({ where: { id }, data: { status: "queued" } });
  return serializarJob(atualizado);
}

export async function cancelarJob(orgId: string, id: string, kind: "import" | "export") {
  const job = await carregarJob(orgId, id, kind);
  if (FINAIS.includes(job.status)) throw new ErroApi(409, "invalid_state", `Já terminou (${job.status}).`);
  const atualizado = await prisma.bulkJob.update({
    where: { id },
    data: { status: "canceled", finishedAt: new Date(), buffer: "" },
  });
  return serializarJob(atualizado);
}

/** POST /v1/imports/{id}/retry-failed — nova importação só com as linhas que falharam (as guardadas). */
export async function refazerFalhas(orgId: string, keyId: string, id: string) {
  const job = await carregarJob(orgId, id, "import");
  if (!FINAIS.includes(job.status) || job.status === "canceled") {
    throw new ErroApi(409, "invalid_state", "Só dá para refazer as falhas de uma importação que terminou.");
  }
  const erros = (Array.isArray(job.errors) ? job.errors : []) as unknown as ErroDeLinha[];
  const records = erros.map((e) => e.record).filter((r): r is Corpo => !!r);
  if (records.length === 0) throw new ErroApi(422, "nothing_to_retry", "Esta importação não tem linhas com falha para refazer.");
  await conferirImportAtivo(orgId);
  const novo = await prisma.bulkJob.create({
    data: {
      orgId,
      apiKeyId: keyId,
      kind: "import",
      entity: job.entity,
      status: "queued",
      format: "json",
      mode: job.mode,
      dryRun: false,
      options: job.options as Prisma.InputJsonValue,
      records: records as Prisma.InputJsonValue,
      total: records.length,
      result: { retry_of: job.id },
    },
  });
  return serializarJob(novo);
}

export const CAMPOS_DE_EXPORTACAO = ["entity", "format", "filters"] as const;
const FILTROS_DE_EXPORTACAO = {
  contacts: ["updated_since", "tag", "owner", "company"],
  deals: ["updated_since", "pipeline", "stage", "owner", "company", "contact", "status", "archived"],
} as const;

/** Filtros guardados no job → URLSearchParams (as mesmas funções de filtro da listagem). */
export function filtrosComoConsulta(filtros: unknown): URLSearchParams {
  const sp = new URLSearchParams();
  if (filtros && typeof filtros === "object") {
    for (const [k, v] of Object.entries(filtros as Record<string, unknown>)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return sp;
}

export async function criarExportacao(orgId: string, keyId: string, corpo: Corpo) {
  conferirCampos(corpo, CAMPOS_DE_EXPORTACAO);
  const entity = enumOpc(corpo, "entity", ["contacts", "deals"] as const);
  if (!entity) throw new ErroApi(400, "invalid_parameter", "entity é obrigatório (contacts ou deals).", { param: "entity" });
  const format = enumOpc(corpo, "format", ["csv", "jsonl"] as const) ?? "csv";
  const filtros = objetoOpc(corpo, "filters") ?? {};
  conferirCampos(filtros, FILTROS_DE_EXPORTACAO[entity]);
  // Valida os filtros agora (data malformada é erro na criação, não no meio do job).
  const sp = filtrosComoConsulta(filtros);
  const where = entity === "contacts" ? await whereDeContatos(orgId, sp) : await whereDeNegocios(orgId, sp);
  const total =
    entity === "contacts"
      ? await prisma.contact.count({ where: where as Prisma.ContactWhereInput })
      : await prisma.deal.count({ where: where as Prisma.DealWhereInput });
  const job = await prisma.bulkJob.create({
    data: { orgId, apiKeyId: keyId, kind: "export", entity, status: "queued", format, options: { filters: filtros } as Prisma.InputJsonValue, total },
  });
  return serializarJob(job);
}

/** Link de download (15 min) quando a exportação terminou. */
export async function exportacaoComLink(job: BulkJob) {
  const r = (job.result ?? {}) as { file_path?: string };
  if (job.status !== "completed" || !r.file_path) return serializarJob(job);
  const url = await urlAssinada(r.file_path, 15 * 60);
  return serializarJob(job, {
    download_url: url,
    download_expires_at: url ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
  });
}
