import { NextResponse } from "next/server";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { processDueEnrollments, enrollBySegments, enrollByDealStage } from "@/lib/server/sequences";
import { runDueBroadcasts } from "@/lib/server/broadcast-runner";
import { registrarBatida, tentarTravarRelogio } from "@/lib/server/heartbeat";
import { processarJobs } from "@/lib/server/api-v1/processar-jobs";
import { limparLixeiraVencida } from "@/lib/server/lixeira";
import { entregarPendentes } from "@/lib/server/webhooks/entrega";

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

  // Carimba o sinal de vida antes de qualquer trabalho: se o scheduler
  // demorar ou falhar no meio, ainda assim fica registrado que o relógio
  // chegou até aqui autenticado.
  await registrarBatida();

  // Mais de um relógio pode estar batendo aqui (o pg_cron do banco e o worker
  // de WhatsApp). Quem chega dentro da janela da rodada em andamento vai
  // embora sem entregar nada — a batida acima já contou como sinal de vida.
  if (!(await tentarTravarRelogio())) {
    return NextResponse.json({ ok: true, skipped: true, ms: Date.now() - startedAt });
  }

  // Primeiro inscreve quem passou a bater com um segmento, depois entrega os
  // passos vencidos — nessa ordem, quem acabou de entrar já começa a contar o
  // relógio a partir de agora em vez de esperar a próxima varredura.
  const [porSegmento, porEtapa] = await Promise.all([enrollBySegments(), enrollByDealStage()]);
  const newlyEnrolled = porSegmento + porEtapa;
  const [sequences, broadcasts] = await Promise.all([processDueEnrollments(50), runDueBroadcasts(10)]);

  // Importação/exportação em lote da API v1, no tempo que sobrar da rodada
  // (a trava do relógio é de 45 s). Nunca derruba a rodada: antes do SQL da
  // v1 ser aplicado a tabela nem existe.
  const orcamentoMs = Math.min(15_000, Math.max(0, 30_000 - (Date.now() - startedAt)));
  const lotes = await processarJobs({ orcamentoMs }).catch((e) => {
    console.error("[scheduler] jobs em lote falharam", e instanceof Error ? e.message : e);
    return { jobs: 0, linhas: 0 };
  });

  // Webhooks de saída: novas tentativas vencidas (a primeira sai logo após o
  // evento). Sem o SQL dos webhooks, não faz nada.
  const webhooks = await entregarPendentes({ orcamentoMs: Math.min(10_000, Math.max(0, 38_000 - (Date.now() - startedAt))) }).catch((e) => {
    console.error("[scheduler] webhooks falharam", e instanceof Error ? e.message : e);
    return { entregues: 0, falhas: 0 };
  });

  // Lixeira: o que passou dos 30 dias some de vez. Também nunca derruba a
  // rodada (sem o SQL da lixeira a tabela não existe e a conta é 0).
  const lixeiraLimpa = await limparLixeiraVencida().catch((e) => {
    console.error("[scheduler] limpeza da lixeira falhou", e instanceof Error ? e.message : e);
    return 0;
  });

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    bulkJobs: lotes,
    webhooks,
    lixeira: { expiradas: lixeiraLimpa },
    sequences: { ...sequences, newlyEnrolled },
    broadcasts: {
      ran: broadcasts.ran,
      sent: broadcasts.results.reduce((sum, r) => sum + r.sentCount, 0),
      // Foram pra fila do WhatsApp QR; o worker soma quando saírem.
      queued: broadcasts.results.reduce((sum, r) => sum + r.queuedCount, 0),
      failed: broadcasts.results.reduce((sum, r) => sum + r.failedCount, 0),
    },
  });
}
