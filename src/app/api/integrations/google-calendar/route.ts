import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionContext, requirePermission } from "@/lib/server/permissions";
import { calendarsOf, googleApp, listCalendars, revoke } from "@/lib/server/google-calendar";

// Google Agenda da pessoa logada neste contrato.
//   GET            → { configured, connection: { email, calendars, status, lastError } | null }
//   GET ?all=1     → agendas conectadas do contrato (bloco "Agenda Google" do agente)
//   PUT { calendars: [{ id, show }] } → quais agendas aparecem
//   DELETE         → desconecta (revoga no Google e apaga)
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("all")) {
    const ctx = await requirePermission("agents:manage");
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const conns = await prisma.googleCalendarConnection.findMany({ where: { orgId: ctx.orgId, status: "active" }, orderBy: { email: "asc" } });
    const names = await prisma.profile.findMany({ where: { id: { in: conns.map((c) => c.userId) } }, select: { id: true, name: true } });
    return NextResponse.json({
      connections: conns.map((c) => ({
        id: c.id,
        email: c.email,
        name: names.find((n) => n.id === c.userId)?.name ?? c.email,
        calendars: calendarsOf(c).map(({ id, name }) => ({ id, name })),
      })),
    });
  }
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const c = await prisma.googleCalendarConnection.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } } });
  // Agendas novas no Google aparecem aqui (desligadas); as escolhas ficam.
  if (c?.status === "active") {
    const fresh = await listCalendars(c).catch(() => null);
    if (fresh) {
      const old = calendarsOf(c);
      const merged = fresh.map((f) => ({ ...f, show: old.find((o) => o.id === f.id)?.show ?? false }));
      if (JSON.stringify(merged) !== JSON.stringify(old)) {
        await prisma.googleCalendarConnection.update({ where: { id: c.id }, data: { calendars: merged as object } });
      }
      c.calendars = merged;
    }
  }
  return NextResponse.json({
    configured: !!googleApp(),
    connection: c ? { email: c.email, calendars: calendarsOf(c), status: c.status, lastError: c.lastError } : null,
  });
}

export async function PUT(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const pedidas = Array.isArray(body?.calendars) ? (body.calendars as { id?: unknown; show?: unknown }[]) : null;
  if (!pedidas) return NextResponse.json({ error: "Mande a lista de agendas." }, { status: 400 });
  const c = await prisma.googleCalendarConnection.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } } });
  if (!c) return NextResponse.json({ error: "Google Agenda não conectada." }, { status: 404 });
  // Só liga/desliga agendas que já são da conta.
  const calendars = calendarsOf(c).map((cal) => {
    const p = pedidas.find((x) => x.id === cal.id);
    return p && typeof p.show === "boolean" ? { ...cal, show: p.show } : cal;
  });
  await prisma.googleCalendarConnection.update({ where: { id: c.id }, data: { calendars: calendars as object } });
  return NextResponse.json({ calendars });
}

export async function DELETE() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const c = await prisma.googleCalendarConnection.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } } });
  if (c) {
    // Revogar mata a autorização da conta no app inteiro: só se nenhum outro contrato usa a mesma conta.
    const outras = await prisma.googleCalendarConnection.count({ where: { email: c.email, id: { not: c.id } } });
    if (!outras) await revoke(c);
    await prisma.googleCalendarConnection.delete({ where: { id: c.id } });
  }
  return NextResponse.json({ ok: true });
}
