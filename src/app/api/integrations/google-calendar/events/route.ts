import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { colegasDeEquipe, intervaloDoPrazo } from "@/lib/server/tarefas";
import { resolverVisao, responsaveisDaVisao } from "@/lib/tarefas/escopo";
import { categoryFromHex, type CalendarEventDto } from "@/lib/google-calendar/slots";
import { calendarsOf, listEvents, type GoogleEvent } from "@/lib/server/google-calendar";

// Eventos do Google Agenda para o calendário de Tarefas.
//   ?de=AAAA-MM-DD&ate=AAAA-MM-DD (dias de SP) &visao=minhas|equipe|todas
// Quem a visão alcança é a mesma regra das tarefas (teto = escopo de negócios
// do papel): o gestor vê a agenda da equipe. Nada é guardado: busca no Google
// a cada pedido, com um cache curto em memória.
const TTL_MS = 60_000;
const cache = new Map<string, { until: number; events: GoogleEvent[] }>();

export async function GET(request: Request) {
  const ctx = await requirePermission("tarefas:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const params = new URL(request.url).searchParams;
  const prazo = intervaloDoPrazo(params.get("de"), params.get("ate"));
  if (!prazo || prazo === "invalido") return NextResponse.json({ error: "Intervalo de datas inválido." }, { status: 400 });

  const visao = resolverVisao(params.get("visao"), ctx.escopo?.negocios);
  const quem = responsaveisDaVisao(visao, ctx.userId, visao === "equipe" ? await colegasDeEquipe(ctx) : []);
  const conns = await prisma.googleCalendarConnection.findMany({
    where: { orgId: ctx.orgId, status: "active", ...(quem ? { userId: { in: quem } } : {}) },
  });
  const names = await prisma.profile.findMany({ where: { id: { in: conns.map((c) => c.userId) } }, select: { id: true, name: true } });

  const seen = new Set<string>();
  const events: CalendarEventDto[] = [];
  const failed: string[] = [];
  await Promise.all(
    conns.flatMap((c) =>
      calendarsOf(c)
        .filter((cal) => cal.show)
        .map(async (cal) => {
          const key = `${c.id}|${cal.id}|${prazo.gte.toISOString()}|${prazo.lt.toISOString()}`;
          const hit = cache.get(key);
          let list = hit && hit.until > Date.now() ? hit.events : null;
          if (!list) {
            if (cache.size > 500) cache.clear();
            try {
              list = await listEvents(c, cal.id, prazo.gte, prazo.lt);
              cache.set(key, { until: Date.now() + TTL_MS, events: list });
            } catch {
              failed.push(c.email);
              return;
            }
          }
          const owner = names.find((n) => n.id === c.userId)?.name ?? c.email;
          for (const e of list) {
            // A mesma reunião na agenda de duas pessoas aparece uma vez.
            const dedupe = `${e.title}|${e.start}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            events.push({ ...e, key: `${c.id}:${cal.id}:${e.id}`, color: categoryFromHex(cal.color), calendar: cal.name, owner, mine: c.userId === ctx.userId });
          }
        })
    )
  );
  return NextResponse.json({ events, failed: [...new Set(failed)] });
}
