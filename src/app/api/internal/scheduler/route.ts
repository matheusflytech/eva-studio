import { NextResponse } from "next/server";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { processDueEnrollments, enrollBySegments, enrollByDealStage } from "@/lib/server/sequences";
import { runDueBroadcasts, type RunResult } from "@/lib/server/broadcast-runner";
import { registrarBatida, tentarTravarRelogio } from "@/lib/server/heartbeat";
import { processarJobs } from "@/lib/server/api-v1/processar-jobs";
import { limparLixeiraVencida } from "@/lib/server/lixeira";
import { entregarPendentes } from "@/lib/server/webhooks/entrega";
import { entregarEventosPendentes } from "@/lib/server/eventos/barramento";
import { rodarAutomacoes } from "@/lib/server/automacoes/varreduras";

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
  // Cada job com o seu catch: um erro numa régua não pode derrubar a rodada
  // inteira (os jobs de baixo nem rodariam e a rota voltaria 500).
  const falhou = <T>(nome: string, vazio: T) => (e: unknown) => {
    console.error(`[scheduler] ${nome} falhou`, e instanceof Error ? e.message : e);
    return vazio;
  };
  const [porSegmento, porEtapa] = await Promise.all([
    enrollBySegments().catch(falhou("inscrição por segmento", 0)),
    enrollByDealStage().catch(falhou("inscrição por etapa", 0)),
  ]);
  const newlyEnrolled = porSegmento + porEtapa;
  const [sequences, broadcasts] = await Promise.all([
    processDueEnrollments(50).catch(falhou("sequências", { processed: 0, delivered: 0, stopped: 0, errors: [] as string[] })),
    runDueBroadcasts(10).catch(falhou("disparos", { ran: 0, results: [] as RunResult[] })),
  ]);

  // Importação/exportação em lote da API v1, no tempo que sobrar da rodada
  // (a trava do relógio é de 45 s). Nunca derruba a rodada: antes do SQL da
  // v1 ser aplicado a tabela nem existe.
  const orcamentoMs = Math.min(15_000, Math.max(0, 30_000 - (Date.now() - startedAt)));
  const lotes = await processarJobs({ orcamentoMs }).catch((e) => {
    console.error("[scheduler] jobs em lote falharam", e instanceof Error ? e.message : e);
    return { jobs: 0, linhas: 0 };
  });

  // Eventos de domínio que a requisição não chegou a entregar (morreu antes
  // do `after`). Antes dos webhooks: o que sair daqui já entra na fila deles.
  const eventos = await entregarEventosPendentes({ orcamentoMs: Math.min(5_000, Math.max(0, 33_000 - (Date.now() - startedAt))) }).catch((e) => {
    console.error("[scheduler] eventos pendentes falharam", e instanceof Error ? e.message : e);
    return { entregues: 0 };
  });

  // Automações: gatilhos de varredura, esperas vencidas e novas tentativas.
  const automacoes = await rodarAutomacoes({ orcamentoMs: Math.min(12_000, Math.max(0, 35_000 - (Date.now() - startedAt))) }).catch((e) => {
    console.error("[scheduler] automações falharam", e instanceof Error ? e.message : e);
    return null;
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
    eventos,
    automacoes,
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
