import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { confirmImport } from "@/lib/server/hotmart/import";

// OK da prévia: a importação passa a gravar no CRM (o relógio aplica).
export async function POST() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!(await confirmImport(ctx.orgId))) return NextResponse.json({ error: "Nenhuma prévia esperando confirmação." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
