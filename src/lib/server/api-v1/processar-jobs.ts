import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { BulkJob, Prisma } from "@/generated/prisma/client";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { baixarTexto, enviarMidia } from "@/lib/server/storage";
import { BOM, linhaCsv } from "@/lib/exportar/csv";
import { paraErroApi } from "./http";
import { MAX_ERROS_GUARDADOS, filtrosComoConsulta, type ErroDeLinha } from "./jobs";
import { linhasDoCsv, linhasDoJson, processarLinha, type EntidadeDeLote, type LinhaDeEntrada } from "./linhas";
import { INCLUDE_CONTATO, serializarContatos, whereDeContatos } from "./contatos";
import { INCLUDE_NEGOCIO, serializarNegocios, whereDeNegocios } from "./negocios";
import { limparChavesVencidas } from "./idempotencia";

// ---------------------------------------------------------------------------
// Processamento dos jobs em lote, chamado pelo relógio (/api/internal/scheduler,
// a cada minuto). Regras:
//   - um job por vez, pego com trava condicional (UPDATE ... WHERE lockedAt
//     livre/vencido): duas rodadas simultâneas nunca processam o mesmo job;
//   - fatias (500 linhas na importação, 1000 na exportação) com checkpoint
//     gravado a cada fatia: se a função morrer no meio, a próxima rodada
//     continua da última fatia gravada;
//   - orçamento de tempo: para antes de estourar o tempo da função (e a trava
//     de 45 s do relógio).
// ---------------------------------------------------------------------------

export const FATIA_IMPORTACAO = 500;
export const FATIA_EXPORTACAO = 1000;
/** Trava vencida = rodada que morreu no meio; outra pode assumir. */
const TRAVA_MS = 2 * 60_000;
/** Teto do arquivo exportado (o bucket aceita até 16 MB). */
export const MAX_BYTES_EXPORTACAO = 15 * 1024 * 1024;

export interface ResumoDosJobs {
  jobs: number;
  linhas: number;
}

export async function processarJobs({ orcamentoMs = 15_000, agora = () => Date.now() } = {}): Promise<ResumoDosJobs> {
  const inicio = agora();
  const resumo: ResumoDosJobs = { jobs: 0, linhas: 0 };
  await limparChavesVencidas().catch(() => 0);

  const tentados = new Set<string>();
  while (agora() - inicio < orcamentoMs) {
    const job = await pegarProximo(tentados);
    if (!job) break;
    tentados.add(job.id);
    resumo.jobs += 1;
    try {
      resumo.linhas += await processarJob(job, () => agora() - inicio < orcamentoMs);
    } catch (e) {
      console.error("[api-v1] job falhou", job.id, e);
      await prisma.bulkJob.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), lockedAt: null, result: { error: paraErroApi(e).message } as Prisma.InputJsonValue },
      });
    }
  }
  return resumo;
}

async function pegarProximo(tentados: Set<string>): Promise<BulkJob | null> {
  const vencida = new Date(Date.now() - TRAVA_MS);
  const candidatos = await prisma.bulkJob.findMany({
    where: {
      status: { in: ["queued", "processing"] },
      id: { notIn: [...tentados] },
      OR: [{ lockedAt: null }, { lockedAt: { lt: vencida } }],
    },
    orderBy: { createdAt: "asc" },
    take: 3,
  });
  for (const c of candidatos) {
    const r = await prisma.bulkJob.updateMany({
      where: { id: c.id, status: { in: ["queued", "processing"] }, OR: [{ lockedAt: null }, { lockedAt: { lt: vencida } }] },
      data: { lockedAt: new Date(), status: "processing", startedAt: c.startedAt ?? new Date() },
    });
    if (r.count === 1) return { ...c, status: "processing", startedAt: c.startedAt ?? new Date() };
  }
  return null;
}

/** Devolve quantas linhas andou. Sempre solta a trava ao sair. */
async function processarJob(job: BulkJob, temTempo: () => boolean): Promise<number> {
  return job.kind === "import" ? processarImportacao(job, temTempo) : processarExportacao(job, temTempo);
}

async function lerLinhas(job: BulkJob): Promise<LinhaDeEntrada[]> {
  const entity = job.entity as EntidadeDeLote;
  if (job.format === "json") {
    if (Array.isArray(job.records)) return linhasDoJson(job.records as unknown[]);
    const texto = job.filePath ? await baixarTexto(job.filePath) : null;
    if (texto === null) throw new Error("Arquivo da importação não encontrado no Storage.");
    const dados = JSON.parse(texto.replace(/^﻿/, ""));
    const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.records) ? dados.records : null;
    if (!lista) throw new Error("O JSON precisa ser uma lista de registros (ou { records: [...] }).");
    return linhasDoJson(lista);
  }
  const texto = job.inputText ?? (job.filePath ? await baixarTexto(job.filePath) : null);
  if (texto === null) throw new Error("Arquivo da importação não encontrado no Storage.");
  const defs = await carregarDefinicoes(job.orgId, entity === "contacts" ? "contact" : "deal");
  return linhasDoCsv(entity, texto, defs);
}

async function processarImportacao(job: BulkJob, temTempo: () => boolean): Promise<number> {
  const linhas = await lerLinhas(job);
  const options = (job.options ?? {}) as { tag_ids?: string[]; pipeline_id?: string | null; stage_id?: string | null };
  let cursor = Number(job.cursor || "0") || 0;
  const cont = { processed: job.processed, created: job.created, updated: job.updated, unchanged: job.unchanged, failed: job.failed };
  const erros = (Array.isArray(job.errors) ? job.errors : []) as unknown as ErroDeLinha[];
  let andou = 0;

  if (linhas.length === 0) {
    await prisma.bulkJob.update({
      where: { id: job.id },
      data: { status: "completed", total: 0, finishedAt: new Date(), lockedAt: null },
    });
    return 0;
  }

  while (cursor < linhas.length && temTempo()) {
    // Cancelado por fora no meio do caminho: para na fatia atual.
    const atual = await prisma.bulkJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (!atual || atual.status === "canceled") return andou;

    const fatia = linhas.slice(cursor, cursor + FATIA_IMPORTACAO);
    for (const linha of fatia) {
      try {
        const r = await processarLinha(job.orgId, job.entity as EntidadeDeLote, linha, {
          modo: job.mode === "create" ? "create" : "upsert",
          simular: job.dryRun,
          tagIds: options.tag_ids,
          pipelineId: options.pipeline_id ?? undefined,
          stageId: options.stage_id ?? undefined,
        });
        cont[r.result] += 1;
      } catch (e) {
        const erro = paraErroApi(e);
        cont.failed += 1;
        if (erros.length < MAX_ERROS_GUARDADOS) {
          erros.push({
            row: linha.row,
            code: erro.code,
            message: erro.message,
            ...(erro.extra.param ? { param: erro.extra.param } : {}),
            ...(erro.extra.details !== undefined ? { details: erro.extra.details } : {}),
            record: linha.record,
          });
        }
      }
      cont.processed += 1;
    }
    cursor += fatia.length;
    andou += fatia.length;
    const terminou = cursor >= linhas.length;
    await prisma.bulkJob.update({
      where: { id: job.id },
      data: {
        ...cont,
        total: linhas.length,
        cursor: String(cursor),
        errors: erros as unknown as Prisma.InputJsonValue,
        ...(terminou
          ? {
              status: cont.failed > 0 ? "completed_with_errors" : "completed",
              finishedAt: new Date(),
              lockedAt: null,
              // O texto inline não serve mais para nada (o retry usa os erros).
              inputText: null,
            }
          : { lockedAt: new Date() }),
      },
    });
    if (terminou) return andou;
  }
  await prisma.bulkJob.update({ where: { id: job.id }, data: { lockedAt: null } });
  return andou;
}

const COLUNAS_CONTATO = [
  "id", "external_id", "name", "email", "phone", "job_title", "company_id", "owner_id", "opt_in", "source", "tags", "custom_fields", "created_at", "updated_at",
] as const;
const COLUNAS_NEGOCIO = [
  "id", "external_id", "name", "pipeline_id", "stage_id", "status", "amount_cents", "currency", "probability", "lost_reason",
  "expected_closing_at", "closed_at", "archived_at", "company_id", "owner_id", "contact_ids", "custom_fields", "created_at", "updated_at",
] as const;

function celulaDe(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

async function processarExportacao(job: BulkJob, temTempo: () => boolean): Promise<number> {
  const entity = job.entity as EntidadeDeLote;
  const sp = filtrosComoConsulta((job.options as { filters?: unknown })?.filters);
  const filtro = entity === "contacts" ? await whereDeContatos(job.orgId, sp) : await whereDeNegocios(job.orgId, sp);
  let buffer = job.buffer;
  let processed = job.processed;
  let cursor = job.cursor;
  let andou = 0;
  const csv = job.format === "csv";

  if (csv && !buffer) {
    buffer = BOM + linhaCsv([...(entity === "contacts" ? COLUNAS_CONTATO : COLUNAS_NEGOCIO)]) + "\r\n";
  }

  while (temTempo()) {
    const atual = await prisma.bulkJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (!atual || atual.status === "canceled") return andou;

    const [valor, id] = cursor ? [new Date(cursor.slice(0, cursor.indexOf("|"))), cursor.slice(cursor.indexOf("|") + 1)] : [null, ""];
    const depois = valor ? { OR: [{ updatedAt: { gt: valor } }, { updatedAt: valor, id: { gt: id } }] } : undefined;
    const args = { take: FATIA_EXPORTACAO, orderBy: [{ updatedAt: "asc" as const }, { id: "asc" as const }] };
    const linhas =
      entity === "contacts"
        ? await serializarContatos(
            job.orgId,
            await prisma.contact.findMany({
              where: depois ? { AND: [filtro as Prisma.ContactWhereInput, depois] } : (filtro as Prisma.ContactWhereInput),
              include: INCLUDE_CONTATO,
              ...args,
            })
          )
        : await serializarNegocios(
            job.orgId,
            await prisma.deal.findMany({
              where: depois ? { AND: [filtro as Prisma.DealWhereInput, depois] } : (filtro as Prisma.DealWhereInput),
              include: INCLUDE_NEGOCIO,
              ...args,
            })
          );

    for (const l of linhas as Array<Record<string, unknown>>) {
      if (csv) {
        const registro: Record<string, unknown> = {
          ...l,
          ...(entity === "contacts"
            ? { tags: (l.tags as { name: string }[]).map((t) => t.name).join("|") }
            : { contact_ids: (l.contacts as { contact_id: string }[]).map((c) => c.contact_id).join("|") }),
        };
        const colunas: readonly string[] = entity === "contacts" ? COLUNAS_CONTATO : COLUNAS_NEGOCIO;
        buffer += linhaCsv(colunas.map((c) => celulaDe(registro[c]))) + "\r\n";
      } else {
        buffer += JSON.stringify(l) + "\n";
      }
    }
    processed += linhas.length;
    andou += linhas.length;
    const ultimo = linhas[linhas.length - 1] as { id: string; updated_at: string } | undefined;
    if (ultimo) cursor = `${ultimo.updated_at}|${ultimo.id}`;

    if (Buffer.byteLength(buffer) > MAX_BYTES_EXPORTACAO) {
      await prisma.bulkJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          lockedAt: null,
          buffer: "",
          processed,
          result: { error: "Exportação maior que 15 MB. Use filtros (updated_since, pipeline...) para dividir." } as Prisma.InputJsonValue,
        },
      });
      return andou;
    }

    if (linhas.length < FATIA_EXPORTACAO) {
      const ext = csv ? "csv" : "jsonl";
      const caminho = `${job.orgId}/exports/${job.id}.${ext}`;
      await enviarMidia(caminho, Buffer.from(buffer, "utf8"), csv ? "text/csv" : "application/x-ndjson");
      await prisma.bulkJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          lockedAt: null,
          buffer: "",
          cursor,
          processed,
          total: processed,
          result: { file_path: caminho, rows: processed, bytes: Buffer.byteLength(buffer) } as Prisma.InputJsonValue,
        },
      });
      return andou;
    }
    await prisma.bulkJob.update({ where: { id: job.id }, data: { buffer, cursor, processed, lockedAt: new Date() } });
  }
  await prisma.bulkJob.update({ where: { id: job.id }, data: { lockedAt: null } });
  return andou;
}
