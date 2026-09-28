-- ---------------------------------------------------------------------------
-- Relógio do produto, dentro do próprio banco.
--
-- Quem entrega passo de sequência e disparo agendado é a rota
-- /api/internal/scheduler do app. Ela só precisa de alguém batendo nela de
-- minuto em minuto. Esse alguém era o worker de WhatsApp no Render — um
-- processo de graça que hiberna, que precisa de ping externo pra acordar, e
-- que quando não redeploya deixa toda a régua parada em silêncio.
--
-- Aqui o relógio passa a ser o pg_cron, que roda dentro do Postgres do
-- Supabase: primeira parte (extensão oficial, sem custo, sem serviço de
-- terceiro) e sem processo nenhum pra manter no ar. O pg_net faz a chamada
-- HTTP de forma assíncrona, então o cron não fica preso esperando resposta.
--
-- COMO RODAR: cole no SQL Editor do Supabase (projeto hregdcwbfpxvcmicojds),
-- trocando <SEGREDO> pelo valor de INTERNAL_API_SECRET que está na Vercel.
-- É uma vez só; depois disso o relógio é do banco.
-- ---------------------------------------------------------------------------

-- 1) Extensões. (Já instaladas em 28/09/2026; o IF NOT EXISTS deixa rodar de novo sem erro.)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 2) O segredo vai pro Vault, não pro texto do job: cron.job é uma tabela
--    legível, e segredo em tabela legível deixa de ser segredo.
select vault.create_secret(
  '<SEGREDO>',
  'eva_internal_api_secret',
  'Segredo compartilhado entre o app e o relógio do produto'
);

-- Se o segredo já existir e você só quiser trocar o valor, use no lugar do acima:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'eva_internal_api_secret'),
--     '<SEGREDO>'
--   );

-- 3) O relógio. Um minuto é a mesma cadência que o worker tinha: passo de
--    régua e disparo agendado se medem em minutos, mais rápido que isso só
--    gastaria conexão à toa.
select cron.schedule(
  'eva_studio_relogio',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://evapp.vercel.app/api/internal/scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'eva_internal_api_secret')
      ),
      timeout_milliseconds := 20000
    );
  $$
);

-- ---------------------------------------------------------------------------
-- Conferir depois de rodar
-- ---------------------------------------------------------------------------

-- O job existe e está ativo:
--   select jobid, jobname, schedule, active from cron.job;

-- As últimas execuções do cron (status 'succeeded' significa que o cron
-- enfileirou a chamada, não que o app respondeu 200):
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;

-- O que o app de fato respondeu (o pg_net guarda a resposta):
--   select id, status_code, content, created
--     from net._http_response order by created desc limit 10;

-- E, do lado do app, a tela de Agentes mostra "worker visto há X" —
-- é a mesma batida, agora vinda do banco.

-- ---------------------------------------------------------------------------
-- Desfazer
-- ---------------------------------------------------------------------------
--   select cron.unschedule('eva_studio_relogio');
--
-- O worker do WhatsApp continua chamando a mesma rota a cada 60s quando está
-- no ar. Os dois juntos não duplicam entrega: a rota tem trava de 45s
-- (src/lib/server/heartbeat.ts, tentarTravarRelogio), e o segundo a chegar
-- dentro da janela recebe {skipped:true} sem entregar nada.
