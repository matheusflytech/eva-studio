# Naming standard: international (English)

Owner's decision (25/10/2026): the Eva Studio CRM follows the international standard. Everything a developer, integrator or URL sees uses English names, as in other CRMs: `deals`, `contacts`, `companies`, `pipelines`, `stages`, `tasks`. No more `negocios`, `funil`, `etapa` and similar.

## The rule

| Layer | Language | Examples |
|---|---|---|
| Public API (`/api/v1`), webhooks, events, OpenAPI, n8n node | English | `deals`, `pipeline_id`, `stage_id`, `deal.stage_changed` |
| CSV import/export columns | English | `pipeline_id`, `stage_id`, `amount_cents` |
| App URLs and query parameters | English | `/deals`, `/contacts`, `/tasks`, `/settings`, `?pipeline=2` |
| Internal API routes (`/api/...`) | English | `/api/search`, `/api/channels`, `/api/saved-views` |
| Database: new tables and columns | English | `eva_studio_sales`, `number`, `source` |
| Code: new files, functions, variables, types | English | `loadPipeline`, `serializeDeal` |
| Text the user reads in the app | Brazilian Portuguese | "Negócios", "Funil", "Etapa" (labels stay in PT-BR) |

Ids follow the same standard: contract = short id (`8d8d3a8c`), pipeline and stage = number within the contract (see `prisma/sql/2026-10-30-numeros-de-funil.sql`).

## How to migrate what already exists

Not all at once. Renaming everything at once (database, routes, thousands of identifiers) breaks integrations, saved flows and automations for no gain to the user. Order:

1. **Public contract first.** API v1, webhooks, CSV and n8n become 100% English. Whatever is still in Portuguese there (e.g. CSV columns `funil_id`/`etapa_id`) is renamed, with the old name still accepted on input for a while.
2. **App URLs.** `/negocios` → `/deals`, `/contatos` → `/contacts`, `/tarefas` → `/tasks`, `/configuracoes` → `/settings`, `?funil=` → `?pipeline=`, `?aba=` → `?tab=`, etc. Old URLs redirect to the new ones (the same mechanism as `destinoDoCaminhoAntigo` in `src/lib/contrato/rotas.ts`), so saved links and emails keep working.
3. **Internal API routes.** Renamed together with the screen that uses them.
4. **Database and code.** Anything new is born in English. Existing tables, columns and functions are renamed when the code around them changes anyway, one area at a time, each time with its own reviewed SQL (rename + compatibility view when needed). Never a single big-bang migration.

## Settled

- **Code comments and commit messages stay in Portuguese** (owner, 25/10/2026): the team is Brazilian. Only names (identifiers, routes, fields) follow the international standard.
- The app's interface text stays in PT-BR. Another language only if the product is sold abroad (then via i18n, not by changing names).
