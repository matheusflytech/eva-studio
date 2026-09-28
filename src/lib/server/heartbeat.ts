import "server-only";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Sinal de vida do worker.
//
// O worker roda fora da Vercel (processo sempre ligado, hoje no Render) e é
// ele que bate no /api/internal/scheduler a cada 60s para entregar passos de
// sequência e disparos agendados. Só que nada no app sabia se ele estava vivo:
// se o processo caísse, ou se o INTERNAL_API_SECRET dos dois lados divergisse,
// tudo responderia 401 em silêncio e as réguas simplesmente não rodariam. Sem
// erro na tela, sem log que alguém olhe.
//
// Agora toda chamada autenticada do scheduler carimba a hora aqui, e a tela de
// agentes mostra "worker visto há X". Silêncio vira informação.
//
// Guardado na tabela de rate limit em vez de uma tabela nova: ela já é um
// par chave/carimbo genérico, e uma migração de banco só para isso custaria
// mais do que vale. O prefixo `heartbeat:` separa as duas finalidades.
// ---------------------------------------------------------------------------

const CHAVE = "heartbeat:scheduler";
const TRAVA = "lock:scheduler";
/** Janela da trava. Maior que a duração normal de uma rodada, menor que o intervalo entre batidas. */
const TRAVA_SEGUNDOS = 45;

/** Chamado pelo scheduler a cada batida do worker. Nunca deve derrubar a rota. */
export async function registrarBatida(): Promise<void> {
  try {
    await prisma.rateLimit.upsert({
      where: { key: CHAVE },
      create: { key: CHAVE, count: 1, windowStart: new Date() },
      update: { count: { increment: 1 }, windowStart: new Date() },
    });
  } catch (error) {
    console.error("[heartbeat] falha ao registrar batida", error);
  }
}

/**
 * Trava de relógio: garante que só uma rodada do scheduler roda por vez.
 *
 * Existe porque agora pode haver mais de um relógio batendo na mesma rota — o
 * pg_cron do Supabase (prisma/relogio.sql) e o worker de WhatsApp, quando está
 * no ar. Duas rodadas simultâneas leriam a mesma inscrição vencida e mandariam
 * a mesma mensagem duas vezes para a mesma pessoa, que é o tipo de erro que o
 * cliente vê e a gente não.
 *
 * A trava é um UPDATE condicional: quem consegue mudar a linha ganha. Um SELECT
 * seguido de UPDATE não serviria — as duas rodadas leriam "livre" antes de
 * qualquer uma escrever.
 */
export async function tentarTravarRelogio(): Promise<boolean> {
  try {
    const linhas = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO eva_studio_rate_limits (key, count, "windowStart")
           VALUES (${TRAVA}, 1, now())
      ON CONFLICT (key) DO UPDATE
              SET "windowStart" = now(),
                  count = eva_studio_rate_limits.count + 1
            WHERE eva_studio_rate_limits."windowStart" < now() - make_interval(secs => ${TRAVA_SEGUNDOS}::int)
        RETURNING key
    `;
    return linhas.length > 0;
  } catch (error) {
    // Falhar fechado deixaria a régua parada para sempre por causa de um erro
    // de banco; falhar aberto no máximo repete uma rodada.
    console.error("[heartbeat] falha ao travar o relogio", error);
    return true;
  }
}

export interface EstadoWorker {
  /** null = nunca bateu: worker nunca subiu, ou nunca autenticou. */
  ultimaBatida: string | null;
  segundosAtras: number | null;
  /** O worker bate a cada 60s; 5 minutos de silêncio já é problema. */
  saudavel: boolean;
  batidas: number;
}

export async function lerEstadoWorker(): Promise<EstadoWorker> {
  try {
    // A idade é calculada PELO POSTGRES, não em JavaScript.
    //
    // A coluna é `timestamp without time zone`, e comparar isso com Date.now()
    // no Node dá a diferença de fuso de brinde: aqui saía 3 horas negativas,
    // o que deixaria `saudavel` sempre verdadeiro e o aviso nunca apareceria.
    // Um alarme que nunca toca é pior que nenhum alarme. Perguntando ao banco,
    // escrita e leitura usam o mesmo relógio e a conta fecha.
    const linhas = await prisma.$queryRaw<{ segundos: number; batidas: number; quando: Date }[]>`
      SELECT EXTRACT(EPOCH FROM (now() - "windowStart"))::int AS segundos,
             count AS batidas,
             "windowStart" AS quando
        FROM eva_studio_rate_limits
       WHERE key = ${CHAVE}
    `;

    const linha = linhas[0];
    if (!linha) return { ultimaBatida: null, segundosAtras: null, saudavel: false, batidas: 0 };

    const segundos = Number(linha.segundos);
    return {
      ultimaBatida: linha.quando.toISOString(),
      segundosAtras: segundos,
      // Negativo só acontece se o relógio do banco andar para trás; tratar
      // como saudável nesse caso é o comportamento menos alarmista.
      saudavel: segundos < 300,
      batidas: Number(linha.batidas),
    };
  } catch (error) {
    console.error("[heartbeat] falha ao ler estado", error);
    return { ultimaBatida: null, segundosAtras: null, saudavel: false, batidas: 0 };
  }
}
