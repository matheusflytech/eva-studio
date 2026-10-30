import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";
import { ipHash } from "@/lib/server/marketing";
import { waUrl } from "@/lib/marketing/touch";

// Link de WhatsApp rastreado (Marketing M1): grava o clique e abre o WhatsApp
// com "(ref: CODE)" no fim da mensagem. A entrada de mensagem lê o código e
// grava a origem do contato. Público: quem clica é o cliente, sem login.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return new NextResponse("Link não encontrado.", { status: 404 });

  const link = await prisma.trackedLink.findUnique({ where: { code } });
  if (!link || link.archivedAt) return new NextResponse("Link não encontrado.", { status: 404 });
  const destino = waUrl(link.phone, link.message, code);

  // Muito clique do mesmo IP: abre o WhatsApp do mesmo jeito, só não conta.
  const ip = getClientIp(request);
  const limite = await checkRateLimit(`wlink:${code}:${ip}`, 30, 60);
  if (limite.allowed) {
    const url = new URL(request.url);
    const cut = (v: string | null) => (v ? v.slice(0, 500) : null);
    await prisma
      .$transaction([
        prisma.linkClick.create({
          data: {
            orgId: link.orgId,
            linkId: link.id,
            gclid: cut(url.searchParams.get("gclid")),
            fbclid: cut(url.searchParams.get("fbclid")),
            referrer: cut(request.headers.get("referer")),
            ipHash: ipHash(ip, code),
          },
        }),
        prisma.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
      ])
      .catch((e) => console.error("[w] falha ao gravar o clique", e instanceof Error ? e.message : e));
  }
  return NextResponse.redirect(destino, 302);
}
