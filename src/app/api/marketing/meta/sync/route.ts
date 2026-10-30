import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { syncAccount } from "@/lib/server/meta-ads";

// "Sincronizar agora": lê na hora as contas ligadas do contrato.
export async function POST() {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const accounts = await prisma.marketingAccount.findMany({ where: { orgId: ctx.orgId, kind: "meta_ads", enabled: true }, select: { id: true } });
  let rows = 0;
  for (const a of accounts) rows += (await syncAccount(a.id)) ?? 0;
  return NextResponse.json({ accounts: accounts.length, rows });
}
