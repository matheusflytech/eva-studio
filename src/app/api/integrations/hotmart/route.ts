import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { apiCredentialsOf, getConnection, hottokOf, resolveFieldMap, saveConnection, suggestStages, validateProducts, type Products } from "@/lib/server/hotmart/connection";
import type { FieldMap } from "@/lib/hotmart/fields";

// Conexão Hotmart do contrato para o painel de Integrações. Nunca devolve hottok nem credencial da API.
export async function GET(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const c = await getConnection(ctx.orgId);
  const [pipelines, customFields] = await Promise.all([
    prisma.pipeline.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { position: "asc" },
      select: { id: true, name: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true } } },
    }),
    // Só campos que valem em todos os funis: um produto pode apontar para qualquer funil.
    prisma.customField.findMany({
      where: { orgId: ctx.orgId, pipelineId: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { entity: true, key: true, label: true, type: true },
    }),
  ]);
  return NextResponse.json({
    connection: c
      ? { url: `${new URL(request.url).origin}/api/webhooks/hotmart/${c.token}`, hasHottok: !!hottokOf(c.secrets), hasApiCredentials: !!apiCredentialsOf(c.secrets), products: c.products, fields: c.fields, status: c.status, lastEventAt: c.lastEventAt }
      : null,
    pipelines: pipelines.map((p) => ({ ...p, suggestion: suggestStages(p.stages) })),
    customFields,
  });
}

export async function PUT(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const secret = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);
  const hottok = secret(body.hottok);
  const products = body.products !== undefined ? await validateProducts(ctx.orgId, body.products) : undefined;
  const status = body.status === "paused" || body.status === "active" ? body.status : undefined;

  // Produtos ou campos mudaram: confere os campos (cria os obrigatórios, completa opções).
  let fields: FieldMap | undefined;
  if (products !== undefined || body.fields !== undefined) {
    const c = await getConnection(ctx.orgId);
    const r = await resolveFieldMap(ctx.orgId, (c?.fields ?? {}) as FieldMap, body.fields, products ?? ((c?.products ?? {}) as unknown as Products));
    if (r.errors.length) return NextResponse.json({ error: r.errors.join(" ") }, { status: 400 });
    fields = r.map;
  }
  await saveConnection(ctx.orgId, { hottok, clientId: secret(body.clientId), clientSecret: secret(body.clientSecret), basic: secret(body.basic), products, fields, status });
  return NextResponse.json({ ok: true });
}
