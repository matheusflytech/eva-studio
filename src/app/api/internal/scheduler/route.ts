import { NextResponse } from "next/server";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { processDueEnrollments, enrollBySegments } from "@/lib/server/sequences";
import { runDueBroadcasts } from "@/lib/server/broadcast-runner";

// ---------------------------------------------------------------------------
// Relógio do produto: entrega os passos de sequência vencidos e os disparos
// agendados cuja hora chegou.
//
// Por que não um cron da Vercel: o plano grátis dá 2 cron jobs com frequência
// mínima de 1x por dia, e nem garante o minuto. Régua de follow-up e disparo
// marcado pras 9h não sobrevivem a isso. Quem chama aqui é o worker do
// WhatsApp (processo sempre ligado no Render, que já faz polling da fila de
// envio) — mesma autenticação por segredo compartilhado que ele já usa.
//
// Também aceita o header `Authorization: Bearer <INTERNAL_API_SECRET>` pra
// poder ser chamado por um cron externo (Cloudflare Worker, cron-job.org,
// UptimeRobot) sem precisar mexer no worker.
// ---------------------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;

  const header = request.headers.get("x-internal-secret");
  if (timingSafeEqualStr(header, expected)) return true;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return timingSafeEqualStr(bearer, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();

  // Primeiro inscreve quem passou a bater com um segmento, depois entrega os
  // passos vencidos — nessa ordem, quem acabou de entrar já começa a contar o
  // relógio a partir de agora em vez de esperar a próxima varredura.
  const newlyEnrolled = await enrollBySegments();
  const [sequences, broadcasts] = await Promise.all([processDueEnrollments(50), runDueBroadcasts(10)]);

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    sequences: { ...sequences, newlyEnrolled },
    broadcasts: {
      ran: broadcasts.ran,
      sent: broadcasts.results.reduce((sum, r) => sum + r.sentCount, 0),
      failed: broadcasts.results.reduce((sum, r) => sum + r.failedCount, 0),
    },
  });
}
