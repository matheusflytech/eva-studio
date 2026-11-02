import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { ehTabelaAusente } from "@/lib/server/contratos";

// Grupos do número de um canal WhatsApp por QR (o worker traz a lista ao conectar
// e quando muda) e, por grupo, se o agente responde:
//   mention  só quando marcam o número ou respondem a ele (padrão)
//   all      responde a tudo
//   off      só registra, nunca responde
// O worker lê o modo a cada 30 s, então a mudança vale em até meio minuto.

const MODES = ["mention", "all", "off"] as const;
type Mode = (typeof MODES)[number];

async function canalDoContrato(channelId: string, orgId: string) {
  return prisma.canal.findFirst({ where: { id: channelId, orgId, tipo: "whatsapp_qr" }, select: { id: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { channelId } = await params;
  if (!(await canalDoContrato(channelId, ctx.orgId))) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });

  try {
    const groups = await prisma.whatsAppGroup.findMany({
      where: { channelId, orgId: ctx.orgId },
      orderBy: [{ present: "desc" }, { subject: "asc" }],
      select: { id: true, jid: true, subject: true, participantsCount: true, mode: true, present: true, syncedAt: true },
      take: 500,
    });
    return NextResponse.json({
      available: true,
      groups: groups.map((g) => ({ ...g, syncedAt: g.syncedAt.toISOString() })),
    });
  } catch (e) {
    // Sem o SQL 2026-11-07 a tabela não existe: a tela mostra o aviso em vez de erro.
    if (ehTabelaAusente(e)) return NextResponse.json({ available: false, groups: [] });
    throw e;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { channelId } = await params;
  if (!(await canalDoContrato(channelId, ctx.orgId))) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { id?: unknown; mode?: unknown } | null;
  if (!body || typeof body.id !== "string" || !MODES.includes(body.mode as Mode)) {
    return NextResponse.json({ error: "Informe o grupo (id) e o modo (mention, all ou off)." }, { status: 400 });
  }

  try {
    // updateMany com channelId + orgId: o grupo só muda se for deste canal e deste contrato.
    const r = await prisma.whatsAppGroup.updateMany({ where: { id: body.id, channelId, orgId: ctx.orgId }, data: { mode: body.mode as Mode } });
    if (r.count === 0) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });
  } catch (e) {
    if (ehTabelaAusente(e)) return NextResponse.json({ error: "Os grupos ainda não foram ativados no banco deste ambiente (SQL 2026-11-07)." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
