import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { IMPORT_KIND, ImportError, cancelImport, startImport, type ImportOptions } from "@/lib/server/hotmart/import";

// Importação do histórico da Hotmart (painel de Integrações): estado da última,
// começar (POST { from, to }) e cancelar (DELETE). O OK da prévia é /confirm.
export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const j = await prisma.bulkJob.findFirst({ where: { orgId: ctx.orgId, kind: IMPORT_KIND }, orderBy: { createdAt: "desc" } });
  if (!j) return NextResponse.json({ job: null });
  const o = j.options as unknown as ImportOptions;
  const r = (j.result ?? {}) as { preview?: unknown; error?: string };
  return NextResponse.json({
    job: {
      id: j.id, status: j.status, phase: o.phase, from: o.from, to: o.to,
      total: j.total, processed: j.processed, applied: j.updated, ignored: j.unchanged, failed: j.failed,
      preview: r.preview ?? null, error: r.error ?? null, createdAt: j.createdAt, finishedAt: j.finishedAt,
    },
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  try {
    const job = await startImport(ctx.orgId, { from: String(body.from ?? ""), to: String(body.to ?? "") });
    return NextResponse.json({ id: job.id }, { status: 202 });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!(await cancelImport(ctx.orgId))) return NextResponse.json({ error: "Nenhuma importação em andamento." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
