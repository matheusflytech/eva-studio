import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { apagarFoto, autorizarUpload, conferirCaminho, prefixoDaPessoa } from "@/lib/server/avatares";

// A própria foto (cada pessoa troca só a sua). Mesmo fluxo da foto do
// contato: POST autoriza o upload, PUT grava, DELETE tira.

async function eu() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return { resposta: NextResponse.json({ error: ctx.error }, { status: ctx.status }) };
  const perfil = await prisma.profile.findUnique({ where: { id: ctx.userId }, select: { id: true, avatarPath: true } });
  if (!perfil) return { resposta: NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 }) };
  return { ctx, perfil };
}

export async function POST(request: Request) {
  const r = await eu();
  if (r.resposta) return r.resposta;
  const limite = await checkRateLimit(`avatar:${r.ctx.userId}`, 20, 60);
  if (!limite.allowed) return NextResponse.json({ error: "Muitos envios seguidos. Espere um instante." }, { status: 429 });
  const up = await autorizarUpload(prefixoDaPessoa(r.ctx.userId), await request.json().catch(() => ({})));
  return up.ok ? NextResponse.json(up.valor) : NextResponse.json({ error: up.erro }, { status: up.status });
}

export async function PUT(request: Request) {
  const r = await eu();
  if (r.resposta) return r.resposta;
  const { path } = await request.json().catch(() => ({}));
  const ok = await conferirCaminho(prefixoDaPessoa(r.ctx.userId), path);
  if (!ok.ok) return NextResponse.json({ error: ok.erro }, { status: ok.status });
  await prisma.profile.update({ where: { id: r.perfil.id }, data: { avatarPath: ok.valor } });
  if (r.perfil.avatarPath !== ok.valor) await apagarFoto(r.perfil.avatarPath);
  return NextResponse.json({ avatarPath: ok.valor });
}

export async function DELETE() {
  const r = await eu();
  if (r.resposta) return r.resposta;
  await prisma.profile.update({ where: { id: r.perfil.id }, data: { avatarPath: null } });
  await apagarFoto(r.perfil.avatarPath);
  return NextResponse.json({ avatarPath: null });
}
