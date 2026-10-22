# Execução — API pública do CRM (v1), fases API-0 a API-5

> Plano de execução do roteiro `2026-10-19-api-crm-roadmap.md`. Tarefas pequenas, cada uma com o teste escrito antes (TDD, Vitest com prisma mockado via `vi.hoisted` + `vi.mock`). Nada roda contra o banco: o `.env` aponta para produção.

## Decisões que valem para tudo

| Tema | Decisão |
|---|---|
| Nomes no JSON | **snake_case** em corpo, resposta e query (`external_id`, `updated_since`, `has_more`). `/api/v1/leads` continua como está (camelCase) para não quebrar ninguém. |
| Erro | `{ "error": { "type", "code", "message", "param?", "details?", "request_id" } }` + header `X-Request-Id`. `code` estável em inglês, mensagem em português. |
| Lista | `{ "data": [...], "has_more": bool, "next_cursor": string\|null, "total?": n }`. `limit` padrão 50, máx. 200. Cursor keyset (`updatedAt`,`id`) em base64url, amarrado ao hash dos filtros (`cursor_mismatch`). Parâmetro desconhecido = `400 unknown_parameter`. |
| Escopos | Coluna aditiva `scopes text[] default '{*}'` em `eva_studio_api_keys`. Chaves antigas = `*`. Escopo = `<recurso>:read\|write` ou `<recurso>:*`. Criar/revogar chave passa a exigir `agents:manage` (admin/dono). |
| Rate limit | Tabela que já existe, por chave: leitura 600/min, escrita 300/min. Headers `RateLimit-Limit/Remaining/Reset` e `Retry-After`. |
| Idempotência | Tabela nova `eva_studio_idempotency_keys`. `Idempotency-Key` opcional em POST/PATCH, obrigatório em lote e importação. 24h. Corpo diferente = `422 idempotency_key_reused`; em andamento = `409 idempotency_in_progress`; repetição devolve a resposta guardada com `Idempotent-Replayed: true`. |
| ID externo | Contato/empresa/negócio **não têm** coluna para isso. Tabela nova `eva_studio_external_refs (orgId, entity, source, externalId, entityId)`, única por `(orgId, entity, source, externalId)` e por `(orgId, entity, source, entityId)`. `source` padrão `api`. |
| Exclusão rastreável | Em vez de `deletedAt` em três tabelas (obrigaria mexer em toda consulta das telas), a exclusão continua real e grava lápide em `eva_studio_deleted_records`. `GET /v1/{contacts,companies,deals}/deleted?since=`. |
| Dedupe/upsert | Ordem: `external_id` → e-mail → telefone. Mais de um candidato no mesmo degrau = `409 ambiguous_match` com os ids. Resposta: `result: created\|updated\|unchanged` e `matched_by`. |
| Dinheiro | `amount_cents` inteiro + `currency`; aceita `amount` em reais como apelido (mesma regra da tela). |
| Histórico de etapa | Todo movimento pela API grava `DealStageEvent` com `origem: "api"`; importação usa `"importacao"`. |
| Schema | Só aditivo. SQL revisado em `prisma/sql/2026-10-20-api-v1.sql` (IF NOT EXISTS, transação). **Não aplicar** daqui. |

## API-0 — Fundação (`src/lib/server/api-v1/`)
1. `http.ts`: `ErroApi`, `erroApi()`, `respostaOk()`, `respostaLista()`, `novoRequestId()`; tradução de `ErroDeCrm` e Prisma (`P2002`→409 `conflict`, `P2025`→404 `not_found`, `P2003`→400). Teste: formato do erro, headers, tradução.
2. `escopos.ts`: `escopoPermite(scopes, recurso, acao)`, `normalizarEscopos()`. Teste: `*`, `contacts:*`, `contacts:read` não escreve, escopo inválido recusado.
3. `auth.ts`: `autenticarChave(request)` → `{ orgId, keyId, scopes }` (select explícito). `requireApiKeyOrgId` passa a usar select explícito (não depende da coluna nova → `/v1/leads` segue funcionando antes do SQL). Teste com prisma mockado.
4. `rate-limit.ts`: `checkRateLimit` devolve também `resetSec` (RETURNING `windowStart`); compatível com quem já usa.
5. `idempotencia.ts`: `comIdempotencia(orgId, chave, metodo, caminho, corpo, executar)`. Teste: primeira vez grava; repetição devolve igual + header; corpo diferente 422; em andamento 409; expirada é refeita.
6. `paginacao.ts`: `codificarCursor/decodificarCursor`, `whereDoCursor`, `lerConsulta(url, permitidos)`, `paginar()`. **Teste de contrato**: banco em memória com 523 registros (inclusive `updatedAt` repetido) percorrido página a página = `COUNT`, sem repetição, `has_more=false` no fim; cursor com filtros diferentes = `cursor_mismatch`.
7. `rota.ts`: `rotaV1({ recurso, acao, idempotencia }, handler)` junta auth → escopo → limite → idempotência → handler → try/catch. Teste: 401, 403 `insufficient_scope`, 429 com `Retry-After`, `X-Request-Id`.
8. `entrada.ts`: leitores tipados do corpo (`textoOpc`, `idOpc`, `boolOpc`, `objOpc`, `dataOpc`) com `param` no erro; `null` limpa, ausente não muda.

## API-1 — Contatos, empresas e negócios
9. `external-refs.ts`: `buscarPorExterno`, `gravarExterno` (troca o do mesmo registro), `externosDe(ids)`, `apagarExternos`, `registrarExclusao`. Teste.
10. `contatos.ts`: serializador público; `lerDadosDeContato(body, modo)` (validação: e-mail, telefone BR, campos personalizados via `mesclarCamposDeContato`, `company_id`/`owner_id` conferidos pela org); `acharCandidatos` (degraus); `criarContato`, `atualizarContato` (PATCH parcial, etiquetas via `applyTag`, opt-out via `optOutContact`), `upsertContato`. Testes: dedupe por cada degrau, ambíguo, unchanged, PATCH parcial, `null` limpa.
11. Rotas: `GET/POST /v1/contacts`, `PUT /v1/contacts/upsert`, `POST /v1/contacts/batch` (≤100, resultado por item), `PUT /v1/contacts/by-external-id/[externalId]`, `GET/PATCH/DELETE /v1/contacts/[id]`, `GET /v1/contacts/[id]/deals`, `GET /v1/contacts/deleted`. Filtros: `updated_since`, `email`, `phone`, `external_id`, `tag`, `owner`, `company`.
12. `empresas.ts` + rotas `GET/POST /v1/companies`, `PUT /v1/companies/by-external-id/[externalId]`, `GET/PATCH/DELETE /v1/companies/[id]`, `GET /v1/companies/deleted`. CNPJ validado e único (regra da tela; `cnpj.ts` sai para `src/lib/server/cnpj.ts`).
13. `negocios.ts` + rotas `GET/POST /v1/deals`, `PUT /v1/deals/by-external-id/[externalId]`, `GET/PATCH/DELETE /v1/deals/[id]`, `POST /v1/deals/[id]/move` (etapa de outro funil só com `pipeline_id` explícito), `POST /v1/deals/[id]/won` e `/lost`, `GET/POST /v1/deals/[id]/contacts`, `DELETE /v1/deals/[id]/contacts/[contactId]`, `GET /v1/deals/[id]/history`, `GET /v1/deals/deleted`. Usa `createDeal`/`moveDealStage` (origem `api`) e `aplicarValores`. Filtros: `updated_since`, `pipeline`, `stage`, `owner`, `company`, `contact`, `status`, `external_id`, `archived`.
14. Tarefas e notas: `GET/POST /v1/tasks`, `GET/PATCH/DELETE /v1/tasks/[id]`, `GET/POST /v1/notes`, `GET/PATCH/DELETE /v1/notes/[id]`. Referências conferidas pela org.
15. Leitura: `GET /v1/custom-fields?entity=&pipeline=`, `GET /v1/tags`.

## API-2 — Funis e etapas
16. Extrair a lógica das rotas internas de funil/etapa para `src/lib/server/funis-acoes.ts` (`criarFunil`, `atualizarFunil`, `apagarFunil`, `reordenarFunis`, `criarEtapa`, `atualizarEtapa`, `apagarEtapa`, `reordenarEtapas`), com resultado tipado (`ok` | erro com status). Rotas internas passam a chamar isto (testes existentes continuam passando).
17. Rotas v1: `GET/POST /v1/pipelines`, `GET/PATCH/DELETE /v1/pipelines/[id]?move_to=`, `POST /v1/pipelines/reorder`, `POST /v1/pipelines/[id]/stages`, `PATCH/DELETE /v1/pipelines/[id]/stages/[stageId]?move_to=`, `POST /v1/pipelines/[id]/stages/reorder`. Testes: limites (20 etapas, 15 funis), `409 move_to_required` com negócios, histórico gravado.

## API-3 — Importação e exportação assíncronas
18. Tabela `eva_studio_bulk_jobs` (tipo, entidade, status, contadores, `cursor` de retomada, `errors` por linha, `result`, `buffer`, trava `lockedAt`).
19. `jobs.ts`: `criarImportacao` (inline `records` ≤5000 ou `csv`, ou `upload: true` → URL assinada do Storage; um import ativo por org; `dry_run`; modo `upsert|create`), `iniciarImportacao` (depois do upload), `cancelar`, `refazerFalhas`, `criarExportacao` (filtros; csv|jsonl).
20. `processar-jobs.ts`: `processarJobs({ orcamentoMs })` — pega um job por vez com trava condicional, fatias de 500 linhas (import) / 1000 (export), grava checkpoint a cada fatia, para no orçamento. Chamado no fim de `/api/internal/scheduler`. Exportação acumula no `buffer` e, ao terminar, sobe para o Storage (`<orgId>/exports/<id>.csv`); `GET /v1/exports/[id]` devolve link assinado de 15 min.
21. Linhas: contato e negócio usam o mesmo upsert da API-1 (sem duplicar regra). CSV com `parseCsv` existente; cabeçalho por nome (`name`, `email`, `phone`, `external_id`, ... ou apelidos pt-BR); coluna desconhecida = campo personalizado.
22. Rotas: `POST /v1/imports`, `GET /v1/imports/[id]`, `GET /v1/imports/[id]/errors`, `POST /v1/imports/[id]/start`, `POST /v1/imports/[id]/cancel`, `POST /v1/imports/[id]/retry-failed`, `POST /v1/exports`, `GET /v1/exports/[id]`. Testes: ciclo completo com retomada (duas rodadas), dry_run não grava, erro por linha, cancelamento.

## API-4 — Fluxos do agente
23. `fluxo-validacao.ts`: um Início, ids únicos, ligações só entre blocos existentes, tipo de bloco conhecido, `validateFlow` sem pendência, ids de funil/etapa/etiqueta/credencial/MCP da própria org, teto de blocos. Teste.
24. Tabela `eva_studio_agent_flow_versions` (versão anterior guardada a cada PUT). Rotas `GET /v1/agents`, `GET/PUT /v1/agents/[id]/flow`, `GET /v1/agents/[id]/flow/versions`, `POST /v1/agents/[id]/flow/restore`.

## API-5 — Sequências
25. `sequencias-v1.ts`: validação de canal, gatilho e ids de gatilho (etiqueta, segmento, etapa) **pela org**, também na edição; passos com `limparPassosDeSequencia`; não ativa sem passo.
26. Rotas `GET/POST /v1/sequences`, `GET/PATCH/DELETE /v1/sequences/[id]`, `GET/POST /v1/sequences/[id]/enrollments`, `DELETE /v1/sequences/[id]/enrollments/[contactId]`.

## Documentação
27. `src/lib/server/api-v1/openapi.ts` (OpenAPI 3.1 à mão) servido em `GET /api/v1/openapi.json` (público). Página `src/app/(app)/integracoes/api/referencia/page.tsx` que lê o JSON e mostra endpoints com exemplo `curl`. Link a partir da página de API existente.

## API-6 — Webhooks de saída (planejado, não implementado)
- Tabelas `eva_studio_webhook_endpoints (orgId, url, secret cifrado, events[], active)` e `eva_studio_webhook_deliveries (endpointId, event, payload, attempts, nextAttemptAt, status, lastError)`.
- Eventos: `contact.created/updated/deleted`, `deal.created/updated/deleted`, `deal.stage_changed` (a partir de `registrarMudancaDeEtapa`), `import.completed`, `export.completed`.
- Assinatura `Eva-Signature: t=<unix>,v1=<hmac-sha256(secret, t + "." + corpo)>`, tolerância de 5 min.
- Entrega no relógio (`/api/internal/scheduler`), espera crescente 1m, 5m, 30m, 2h, 12h; desliga o endpoint após 3 dias falhando. URL conferida com `src/lib/server/ssrf.ts`.

## Status (20/10/2026)
- API-0 a API-5 implementadas, com testes; API-6 só planejada (acima).
- Desvios conscientes: negócio deduplica só por `external_id` (não tem e-mail/telefone; na importação, o contato do negócio é achado/criado por `contact_external_id` → `contact_email` → `contact_phone`); empresa usa o CNPJ como reserva do `external_id`; status da importação (`GET /imports/{id}`) pede `imports:write` (não existe `imports:read` no roteiro).
- Exportação acumula no próprio job até terminar e sobe um arquivo só (teto 15 MB: o bucket aceita 16). Acima disso, dividir por filtro.
- `dry_run` de negócio sem funil pode criar o funil padrão (é o `ensureDefaultPipeline` de sempre); nada além disso é gravado.
- A tela de chaves ainda não oferece escolha de escopo (a rota já aceita `scopes`); a página de referência fica dentro do app, o JSON é público.
- Pendente de quem aplica: rodar `prisma/sql/2026-10-20-api-v1.sql` antes do deploy.

## Verificação final
`npx vitest run` (suíte inteira), `npx tsc --noEmit -p .`, `npx eslint` nos arquivos tocados.
