import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { apagarFoto, autorizarUpload, conferirCaminho, prefixoDoContato } from "@/lib/server/avatares";

// Foto do contato. POST { mime, size } -> { path, uploadUrl, token } (o
// navegador sobe direto ao storage); PUT { path } grava e apaga a anterior;
// DELETE tira a foto.

type Params = { params: Promise<{ contactId: string }> };

async function contatoEditavel(params: Params["params"]) {
  const ctx = await requirePermission("contatos:editar");
  if ("error" in ctx) return { resposta: NextResponse.json({ error: ctx.error }, { status: ctx.status }) };
  const { contactId } = await params;
  const contato = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "contatos")) },
    select: { id: true, avatarPath: true },
  });
  if (!contato) return { resposta: NextResponse.json({ error: "Contato não encontrado." }, { status: 404 }) };
  return { ctx, contato };
}

export async function POST(request: Request, { params }: Params) {
  const r = await contatoEditavel(params);
  if (r.resposta) return r.resposta;
  const limite = await checkRateLimit(`avatar:${r.ctx.userId}`, 20, 60);
  if (!limite.allowed) return NextResponse.json({ error: "Muitos envios seguidos. Espere um instante." }, { status: 429 });
  const up = await autorizarUpload(prefixoDoContato(r.ctx.orgId), await request.json().catch(() => ({})));
  return up.ok ? NextResponse.json(up.valor) : NextResponse.json({ error: up.erro }, { status: up.status });
}

export async function PUT(request: Request, { params }: Params) {
  const r = await contatoEditavel(params);
  if (r.resposta) return r.resposta;
  const { path } = await request.json().catch(() => ({}));
  const ok = await conferirCaminho(prefixoDoContato(r.ctx.orgId), path);
  if (!ok.ok) return NextResponse.json({ error: ok.erro }, { status: ok.status });
  await prisma.contact.update({ where: { id: r.contato.id }, data: { avatarPath: ok.valor } });
  if (r.contato.avatarPath !== ok.valor) await apagarFoto(r.contato.avatarPath);
  return NextResponse.json({ avatarPath: ok.valor });
}

export async function DELETE(_request: Request, { params }: Params) {
  const r = await contatoEditavel(params);
  if (r.resposta) return r.resposta;
  await prisma.contact.update({ where: { id: r.contato.id }, data: { avatarPath: null } });
  await apagarFoto(r.contato.avatarPath);
  return NextResponse.json({ avatarPath: null });
}
