import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { connectionByToken, hottokOf, sameSecret, type Products } from "@/lib/server/hotmart/connection";
import { applyEvent } from "@/lib/server/hotmart/apply";

// ---------------------------------------------------------------------------
// Webhook da Hotmart (2.0) de um contrato. O token na URL acha a conexão; o
// header X-HOTMART-HOTTOK é a credencial (comparado em tempo constante).
// Evento repetido (mesmo id) responde 200 sem aplicar de novo: a Hotmart
// reenvia até receber 200. A regra roda depois da resposta (after).
// ---------------------------------------------------------------------------

const PER_MINUTE = 600;
const MAX_BYTES = 128_000;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const connection = await connectionByToken(token);
  if (!connection) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const limit = await checkRateLimit(`hook-hotmart:${connection.id}`, PER_MINUTE, 60);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas chamadas." }, { status: 429 });

  if (!sameSecret(request.headers.get("x-hotmart-hottok") ?? "", hottokOf(connection.secrets))) {
    return NextResponse.json({ error: "Hottok inválido." }, { status: 401 });
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const event = String(payload.event ?? "");
  if (!event) return NextResponse.json({ ok: true, ignored: "sem evento" });
  if (connection.status !== "active") return NextResponse.json({ ok: true, ignored: "conexão pausada" });

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo */
  const d = (payload.data ?? {}) as any;
  const hotmartEventId = String(payload.id ?? `${event}:${d.purchase?.transaction ?? ""}:${payload.creation_date ?? ""}`).slice(0, 200);
  let row: { id: string };
  try {
    row = await prisma.hotmartEvent.create({
      data: {
        orgId: connection.orgId, connectionId: connection.id, hotmartEventId, event: event.slice(0, 80),
        productId: d.product?.id ? String(d.product.id) : null,
        transaction: d.purchase?.transaction ? String(d.purchase.transaction) : null,
        email: d.buyer?.email ? String(d.buyer.email).trim().toLowerCase() : null,
        payload: payload as object,
      },
      select: { id: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ ok: true, repeated: true });
    throw e;
  }

  after(async () => {
    const r = await applyEvent(connection.orgId, connection.products as unknown as Products, payload);
    await prisma.hotmartEvent.update({
      where: { id: row.id },
      data: { result: r.result, detail: r.detail ?? null, contactId: r.contactId ?? null, dealId: r.dealId ?? null, processedAt: new Date() },
    });
    await prisma.hotmartConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date() } }).catch(() => {});
  });
  return NextResponse.json({ ok: true });
}
