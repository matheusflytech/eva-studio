import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { deleteImportedMeta, disconnectMeta, metaAdsApp } from "@/lib/server/meta-ads";

// Meta Ads na aba Marketing: conexão (sem token), contas, ligar/desligar,
// desconectar e apagar o que foi importado.
export async function GET() {
  const ctx = await requirePermission("marketing:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const [connections, accounts] = await Promise.all([
    prisma.marketingConnection.findMany({
      where: { orgId: ctx.orgId, provider: "meta", status: { not: "revoked" } },
      select: { id: true, status: true, externalLabel: true, tokenType: true, expiresAt: true, lastError: true, updatedAt: true },
    }),
    prisma.marketingAccount.findMany({
      where: { orgId: ctx.orgId, kind: "meta_ads", connection: { status: { not: "revoked" } } },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      select: { id: true, externalId: true, name: true, currency: true, enabled: true, lastSyncAt: true, lastSyncError: true, syncedThrough: true },
    }),
  ]);
  return NextResponse.json({ configured: !!metaAdsApp(), connections, accounts });
}

/** Liga/desliga uma conta. Ligar agenda a leitura para já. */
export async function PATCH(request: Request) {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const b = await request.json().catch(() => ({}));
  if (typeof b.accountId !== "string" || typeof b.enabled !== "boolean") return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  const u = await prisma.marketingAccount.updateMany({
    where: { id: b.accountId, orgId: ctx.orgId, kind: "meta_ads" },
    data: b.enabled ? { enabled: true, nextSyncAt: new Date() } : { enabled: false },
  });
  if (!u.count) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Desconecta (as métricas ficam). Com ?data=1 apaga só o gasto importado. */
export async function DELETE(request: Request) {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (new URL(request.url).searchParams.get("data") === "1") return NextResponse.json({ deleted: await deleteImportedMeta(ctx.orgId) });
  await disconnectMeta(ctx.orgId);
  return NextResponse.json({ ok: true });
}
