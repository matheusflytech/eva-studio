# Roadmap — API pública do CRM da Eva (v1)

> Documento-mãe. Cada fase vira um plano de implementação próprio, com código e testes, na hora de executar. Pesquisa de referência: Beeno (collection e ETL locais), Mautic (base do Beeno), HubSpot CRM v3, Twenty, Stripe.

## Escopo pedido
- Contatos, empresas e negócios: CRUD, **importar e exportar de forma robusta**, sem duplicar.
- **Funis e etapas** via API.
- **Fluxos do agente** (Builder) via API, validados.
- **Automações do CRM** via API (as sequências que já existem: gatilho por etiqueta, segmento ou etapa).
- Importação em **lote assíncrono**. Duplicados por **ID externo**, com e-mail/telefone de reserva.

## O que a pesquisa ensinou (e vira regra)

| Dor vista no Beeno/Mautic | Regra na API da Eva |
|---|---|
| `hasMore` nunca vira `false`; cursor entra em ciclo | Cursor keyset (`updatedAt`,`id`), `hasMore=false` quando a página vem vazia, **teste de contrato** que percorre tudo e compara com `COUNT` |
| Cursor ignorado no corpo do `/search` | Cursor só por query string, validado contra o hash dos filtros (`cursor_mismatch`) |
| Telefone só por `/search-cellphone` | Telefone e e-mail normalizados e aceitos em qualquer filtro |
| Não lista os negócios de um contato | Sub-recursos desde o início: `GET /contacts/{id}/deals`, `GET /deals/{id}/contacts` |
| `PATCH` apaga associações e exige campos | `PATCH` parcial de verdade: chave ausente não muda nada, `null` limpa |
| 500 em "não encontrado"/payload inválido | Busca vazia = `200 data:[]`; erro de entrada = `400/422` com `param` |
| Filtro desconhecido ignorado em silêncio | Parâmetro desconhecido = `400 unknown_parameter` |
| Retry de criação duplica | `Idempotency-Key` em todo `POST` + `externalId` único por organização |
| Rate limit escondido | Headers `RateLimit-Limit/Remaining/Reset` e `Retry-After` |
| Exclusão invisível na sincronização | `deletedSince` (registros removidos ficam marcados) |
| Datas sem fuso, tudo string | ISO-8601 com fuso; números, booleanos e listas com tipo real |

## Convenções (valem para todas as fases)
- **Base:** `/api/v1/...`; a organização vem da chave, nunca da URL.
- **Autenticação:** `Authorization: Bearer evs_live_...` (formato atual mantido). Chave ganha **escopos** (`contacts:read`, `contacts:write`, `deals:*`, `pipelines:*`, `flows:*`, `sequences:*`, `imports:write`, `exports:read`); chaves antigas viram `*` para não quebrar ninguém. Criar/revogar chave passa a exigir papel admin/dono.
- **Erro:** `{ "error": { "type", "code", "message", "param?", "requestId" } }` + header `X-Request-Id`. Mensagens em português, `code` estável em inglês.
- **Lista:** `{ "data": [...], "hasMore": bool, "nextCursor": string|null }`; `limit` padrão 50, máximo 200; `includeTotal=true` opcional.
- **Upsert:** `PUT /contacts/upsert` e `/deals/upsert` (e em lote). Ordem de busca: `externalId` → e-mail → telefone. Mais de um candidato = `409 ambiguous_match` com os ids. Resposta diz `result: created|updated|unchanged` e `matchedBy`.
- **Lote síncrono:** até 100 itens, resultado por item (`index`, `status`, `id` ou `error`), nunca tudo-ou-nada.
- **Idempotência:** `Idempotency-Key` (até 255) em `POST`/`PATCH`; obrigatório em lote e importação; 24h; mesma chave com corpo diferente = `422 idempotency_key_reused`; resposta repetida leva `Idempotent-Replayed: true`.
- **Rate limit:** por chave, na tabela de rate limit que já existe (sem infraestrutura nova): leitura 600/min, escrita 300/min, busca 120/min.
- **Dinheiro:** centavos inteiros + `currency`. **Telefone:** devolvido em `+55...`.
- **Documentação:** OpenAPI gerado a partir dos mesmos validadores do código, com exemplos testados.

## Fases

### API-0 — Fundação
Resposta/erro padrão, `requestId`, escopos na chave (coluna aditiva), rate limit com headers, tabela de idempotência, cursor keyset (codificar/validar), validação de entrada (helpers próprios, sem dependência nova), mapeamento de erros do Prisma (`P2002`→409, `P2025`→404). Testes de contrato da paginação.

### API-1 — Contatos, empresas e negócios
Colunas aditivas `externalId` (+ índice único por organização) em contato, empresa e negócio; `deletedAt` para exclusão rastreável. CRUD, busca com filtros (`updatedSince`, `email`, `phone`, `externalId`, `tag`, `pipelineId`, `stageId`, `contactId`), upsert, lote síncrono, associações (`/contacts/{id}/deals`…). Correções vistas no mapa: `companyId`/`ownerId` validados pela organização; negócio não pode ir para etapa de outro funil sem mover de funil explicitamente.

### API-2 — Funis e etapas
CRUD de funis e etapas, reordenar, excluir com `moveTo` obrigatório quando há negócios (mesma regra da tela). Reaproveita `src/lib/server/funis.ts`.

### API-3 — Importação e exportação assíncronas
- **Importar:** `POST /imports` → `{ id, uploadUrl }` (arquivo vai direto para o Storage, sem passar pelo limite de 4,5 MB da Vercel) ou `records` inline até 5 mil. Estados `pending_upload → queued → processing → completed | completed_with_errors | failed | canceled`. Processamento em fatias de 500 linhas no relógio que já roda a cada minuto (pg_cron → `/api/internal/scheduler`), com checkpoint por linha (retoma de onde parou). `GET /imports/{id}`, `/errors` (linha, coluna, código, valor), `retry-failed`, `cancel`, `dryRun`. Um import ativo por organização.
- **Exportar:** listagem com cursor + `updatedSince` para sincronização; `POST /exports` gera CSV/JSONL no Storage com link assinado (15 min) para volume.

### API-4 — Fluxos do agente
`GET/PUT /agents/{id}/flow` com **validação de verdade** (hoje o Builder salva sem validar): um bloco Início, ids únicos, ligação só entre blocos existentes, tipos de bloco válidos, `validateFlow` sem pendência bloqueante; versão anterior guardada para desfazer.

### API-5 — Automações (sequências)
CRUD de sequências e passos, inscrever/remover contatos. Corrige o que o mapa achou: ids de gatilho (etiqueta, segmento, etapa) conferidos contra a organização; canal e gatilho validados também na edição.

### API-6 — Webhooks de saída (opcional, depois)
`contact.created/updated/deleted`, `deal.stage_changed`, `import.completed`; assinatura HMAC com timestamp; retry com espera crescente.

## Dependência com os dashboards do funil
O histórico de etapas criado no plano dos dashboards (`DealStageEvent`) também alimenta a API (`deal.stage_changed`, `GET /deals/{id}/history`). Por isso os dashboards vêm antes da API-1.
