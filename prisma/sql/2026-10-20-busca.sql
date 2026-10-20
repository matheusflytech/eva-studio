-- Busca global ⌘K / Ctrl+K (item 4 de docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md).
-- SÓ ADITIVO: duas extensões (se faltarem), uma função nova e índices novos.
-- Nenhuma tabela/coluna muda. Sem este arquivo a busca FUNCIONA, mais lenta:
-- o app detecta (src/lib/server/busca.ts, cache de 5 min) e cai para
-- translate(lower(col)) + LIKE sem índice e sem a busca por semelhança.
--
-- SUPABASE: unaccent e pg_trgm estão na lista de extensões permitidas. O
-- recomendado é instalar no schema "extensions" (não em public). Se alguma já
-- estiver instalada em outro schema, o CREATE EXTENSION abaixo não faz nada,
-- a função (passo 2) usa o schema onde o unaccent estiver de fato, e nos
-- índices (passo 3) troque "extensions.gin_trgm_ops" pelo schema certo
-- (SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'pg_trgm').
--
-- COMO APLICAR (com OK do Alfredo; NÃO roda sozinho):
--   1. Passos 1 e 2 (extensões + função): rodar como estão. São instantâneos.
--      A partir daqui o app já usa a função (sem acento de verdade).
--   2. Passo 3 (índices):
--      * Base pequena / janela de manutenção: rodar como está. CREATE INDEX
--        comum TRAVA ESCRITA na tabela enquanto constrói (mensagens e notas
--        podem levar minutos numa base grande).
--      * Produção com tabela grande: trocar "CREATE INDEX IF NOT EXISTS" por
--        "CREATE INDEX CONCURRENTLY IF NOT EXISTS" e rodar UMA instrução por
--        vez, FORA de transação (CONCURRENTLY não roda dentro de BEGIN/COMMIT,
--        nem num bloco com várias instruções no editor do Supabase, nem na
--        conexão do pooler em modo transação, porta 6543 — use a conexão
--        direta/sessão). Não trava escrita. Se falhar no meio, o índice fica
--        INVALID: DROP INDEX CONCURRENTLY <nome>; e rode de novo.
--   Este arquivo não usa BEGIN/COMMIT de propósito, para servir aos dois modos.
--
-- CUSTO: índice GIN trigram ocupa ~2-3x o texto indexado. O de mensagens é o
-- maior (eva_studio_messages é a tabela que mais cresce) e é o que deixa a
-- busca em mensagens rápida; sem ele a busca em mensagens continua limitada a
-- 90 dias e a 1,5 s (statement_timeout local), e some do resultado com aviso
-- se estourar.
--
-- META: p95 < 150 ms no /api/busca (cabeçalho Server-Timing: busca;dur=...).

-- 1. Extensões ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2. Função de normalização ---------------------------------------------------
-- unaccent() é STABLE (depende do dicionário/search_path), então não pode ir
-- em índice. Este invólucro fixa o dicionário pelo nome qualificado e é
-- IMMUTABLE: é o padrão recomendado para indexar texto sem acento.
-- search_path vazio = nada resolvido pelo caminho de busca de quem chama (o
-- linter de segurança do Supabase pede isso).
DO $do$
DECLARE
  esquema text;
BEGIN
  SELECT n.nspname INTO esquema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'unaccent';
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.eva_studio_norm(t text) RETURNS text
         LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
         SET search_path = ''
         AS $b$ SELECT pg_catalog.lower(%1$I.unaccent(%2$L::regdictionary, t)) $b$$f$,
    esquema, esquema || '.unaccent'
  );
END
$do$;

-- 3. Índices GIN trigram -------------------------------------------------------
-- Servem ao LIKE 'termo%' e '% termo%' (começo de palavra), ao LIKE '%trecho%'
-- do telefone e ao operador <% (semelhança). As expressões são IDÊNTICAS às
-- do código; mudar uma sem a outra faz o índice deixar de ser usado.

-- Nomes (negócio, empresa, contato) e e-mail do contato.
CREATE INDEX IF NOT EXISTS "eva_studio_deals_busca_nome_idx"
  ON "eva_studio_deals" USING gin (public.eva_studio_norm("name") extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_companies_busca_nome_idx"
  ON "eva_studio_companies" USING gin (public.eva_studio_norm("name") extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_busca_nome_idx"
  ON "eva_studio_contacts" USING gin (public.eva_studio_norm("name") extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_busca_email_idx"
  ON "eva_studio_contacts" USING gin (public.eva_studio_norm("email") extensions.gin_trgm_ops);
-- E-mails secundários (JSON), quando a consulta tem "@".
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_busca_emails_idx"
  ON "eva_studio_contacts" USING gin (lower("emails"::text) extensions.gin_trgm_ops);

-- Telefone por qualquer trecho (só dígitos; cobre o legado gravado com máscara),
-- telefones secundários (JSON) e id do canal (WhatsApp: 5511…@s.whatsapp.net).
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_busca_telefone_idx"
  ON "eva_studio_contacts" USING gin (regexp_replace("phone", '[^0-9]', '', 'g') extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_busca_telefones_idx"
  ON "eva_studio_contacts" USING gin (("phones"::text) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_contact_channels_busca_externo_idx"
  ON "eva_studio_contact_channels" USING gin ("externalId" extensions.gin_trgm_ops);

-- CNPJ colado com pontuação (compara só os dígitos, pelo começo).
CREATE INDEX IF NOT EXISTS "eva_studio_companies_busca_cnpj_idx"
  ON "eva_studio_companies" USING gin (regexp_replace("cnpj", '[^0-9]', '', 'g') extensions.gin_trgm_ops);

-- Corpo de notas e de mensagens.
CREATE INDEX IF NOT EXISTS "eva_studio_notes_busca_texto_idx"
  ON "eva_studio_notes" USING gin (public.eva_studio_norm("text") extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "eva_studio_messages_busca_texto_idx"
  ON "eva_studio_messages" USING gin (public.eva_studio_norm("text") extensions.gin_trgm_ops);

-- Depois de criar: ANALYZE para o planejador conhecer os índices novos.
ANALYZE "eva_studio_deals";
ANALYZE "eva_studio_companies";
ANALYZE "eva_studio_contacts";
ANALYZE "eva_studio_contact_channels";
ANALYZE "eva_studio_notes";
ANALYZE "eva_studio_messages";

-- CONFERIR (p95): rode algumas buscas pela paleta e veja o Server-Timing, ou
--   EXPLAIN (ANALYZE, BUFFERS) <consulta> — deve aparecer "Bitmap Index Scan on
--   eva_studio_*_busca_*_idx", não "Seq Scan".
-- DESFAZER (se preciso): DROP INDEX CONCURRENTLY de cada um acima e
--   DROP FUNCTION public.eva_studio_norm(text); (o app volta ao modo sem SQL).
