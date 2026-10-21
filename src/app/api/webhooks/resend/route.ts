import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assinaturaDoWebhookConfere } from "@/lib/server/email/resend";
import { bounceDefinitivo, proximaSituacao, situacaoDoEvento } from "@/lib/server/email/eventos";
import { suprimirEmail } from "@/lib/server/email/envio";

// Eventos de entrega da Resend (enviado, entregue, aberto, clicado, bounce,
// reclamação). Assinado pelo Svix com RESEND_WEBHOOK_SECRET. Bounce
// permanente e reclamação de spam põem o endereço na supressão do contrato:
// insistir num endereço assim derruba a reputação do domínio.
export async function POST(request: Request) {
  const corpo = await request.text();
  const ok = assinaturaDoWebhookConfere(
    corpo,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      assinatura: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SECRET ?? ""
  );
  if (!ok) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });

  let evento: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    evento = JSON.parse(corpo || "{}");
  } catch {
    return NextResponse.json({ ok: true });
  }
  const situacao = situacaoDoEvento(String(evento.type ?? ""));
  const resendId = typeof evento.data?.email_id === "string" ? evento.data.email_id : null;
  // 200 quando não há o que fazer: erro faria a Resend repetir à toa.
  if (!situacao || !resendId) return NextResponse.json({ ok: true });

  try {
    const envio = await prisma.emailEnvio.findUnique({ where: { resendId }, select: { id: true, orgId: true, para: true, status: true } });
    if (!envio) return NextResponse.json({ ok: true });

    const quando = evento.created_at ? new Date(evento.created_at) : new Date();
    const nova = proximaSituacao(envio.status, situacao);
    const detalhe = situacao === "bounce" ? evento.data?.bounce : situacao === "falhou" ? evento.data?.failed : null;
    await prisma.emailEnvio.update({
      where: { id: envio.id },
      data: {
        ...(nova ? { status: nova } : {}),
        ...(situacao === "aberto" ? { abertoEm: quando } : {}),
        ...(situacao === "clicado" ? { clicadoEm: quando } : {}),
        ...(detalhe ? { erro: JSON.stringify(detalhe).slice(0, 300) } : {}),
      },
    });

    if (situacao === "reclamacao") await suprimirEmail(envio.orgId, envio.para, "reclamacao");
    if (situacao === "bounce" && bounceDefinitivo(evento.data as { bounce?: { type?: string } })) {
      const motivo = (evento.data?.bounce as { message?: string } | undefined)?.message ?? "";
      await suprimirEmail(envio.orgId, envio.para, "bounce", motivo);
    }
  } catch {
    // Sem as tabelas de e-mail: nada a registrar.
  }
  return NextResponse.json({ ok: true });
}
