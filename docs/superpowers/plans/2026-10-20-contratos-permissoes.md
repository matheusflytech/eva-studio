# Contratos, acesso a N contratos, permissões e chaves por contrato

Data: 2026-10-20 · Branch: worktree a partir de `feat/dashboards-funil`

## Objetivo

- Cada cliente é um **contrato** (no código continua sendo `Organization`; a UI
  diz "Contrato" e mostra o ID com botão copiar).
- Uma pessoa pode ter acesso a **N contratos** (tabela de vínculo), com papel
  próprio em cada um.
- O **ID do contrato fica na URL**: `/<idDoContrato>/negocios`,
  `/<id>/negocios/<dealId>`, `/<id>/contatos` etc. Caminhos antigos
  (`/negocios`...) continuam funcionando com redirecionamento.
- Permissões granulares por módulo × ação, papéis personalizados, grupos de
  permissões, equipes e escopo de dados (meus / da equipe / todos).
- Superadmin (equipe Eva) acima de todos os contratos, painel `/admin`.
- Chaves de API por contrato com escopos escolhidos na tela, responsável,
  último uso, expiração opcional e revogação.

## Modelo de dados (só aditivo)

SQL: `prisma/sql/2026-10-20-contratos-permissoes.sql` (BEGIN/COMMIT, IF NOT
EXISTS, FKs em `DO $$`, backfill idempotente). Nenhum DROP/RENAME/ALTER TYPE.
O diff do Prisma sugere derrubar o índice vetorial dos chunks — **nunca** entra.

| Tabela | Colunas principais |
| --- | --- |
| `eva_studio_memberships` | id, orgId, userId (= Profile.id), role (owner/admin/agent/viewer, papel de sistema base), roleId? (papel personalizado), groupIds text[], status (`ativo`/`convidado`/`removido`), invitedById?, createdAt, updatedAt. Único (orgId, userId). |
| `eva_studio_roles` | papéis personalizados: id, orgId, name, description, permissions text[], groupIds text[], dataScope jsonb (`{negocios, contatos, conversas}` → `proprios`/`equipe`/`todos`). |
| `eva_studio_permission_groups` | grupos: id, orgId, name, description, permissions text[]. |
| `eva_studio_teams` | id, orgId, name, leaderId? |
| `eva_studio_team_members` | (teamId, userId) PK. |
| `eva_studio_api_keys` (+2 colunas) | `createdById` text null, `expiresAt` timestamp null. |

`Profile.orgId` fica como **contrato padrão / compatibilidade**. As equipes da
pessoa moram em `eva_studio_team_members` (não em `teamIds` no vínculo): uma
fonte só, consulta direta "quem é da minha equipe".

**Backfill**: um vínculo `ativo` por Profile existente, `(Profile.orgId,
Profile.id, Profile.role)`, com `ON CONFLICT DO NOTHING` (idempotente).

### Regra de acesso (o coração da segurança)

A pessoa acessa o contrato X se:

1. tem vínculo (X, ela) com status `ativo` ou `convidado`; **ou**
2. não tem vínculo nenhum com X **e** `Profile.orgId = X` (legado: antes do
   backfill / SQL não aplicado); **ou**
3. é superadmin (`EVA_SUPERADMINS`).

Vínculo `removido` bloqueia mesmo que `Profile.orgId = X` — remover alguém do
contrato padrão dele não pode deixar a porta aberta pelo legado.

Antes do SQL ser aplicado (tabela ausente, erro P2021/P2022), tudo cai no
comportamento antigo (só `Profile.orgId`). Login nunca quebra por isso.

## Sessão e contrato ativo

**Fonte da verdade na tela: o contrato da URL.** O navegador manda o contrato
em toda chamada `/api/*` pelo cabeçalho **`x-eva-contrato`**:

- `src/lib/contrato/fetch-do-app.ts` embrulha `window.fetch` uma vez (importado
  pelos providers da raiz). A cada chamada lê o contrato de
  `window.location.pathname` **naquele momento** e acrescenta o cabeçalho em
  chamadas mesmo-origem para `/api/*` (fora `/api/v1` e `/api/webhooks`, que
  não usam sessão). Cada aba tem sua URL, então duas abas em contratos
  diferentes nunca se misturam.
- Para o que o navegador abre sozinho (download por `<a href>`, OAuth do
  Instagram, imagem de anexo) o contrato vai em `?contrato=` (helper
  `apiDoContrato`), ou é deduzido do caminho do arquivo (anexos já têm o orgId
  como prefixo).
- Servidor (`resolverContratoAtivo` em `src/lib/server/contratos.ts`), em ordem:
  cabeçalho → `?contrato=` → cookie `eva_contrato` (último usado) →
  `Profile.orgId` → primeiro vínculo ativo. **Cabeçalho ou query presentes e
  sem acesso = 403**, sem cair em outro contrato (nada de mostrar dados de um
  contrato numa aba que pediu outro). Cookie inválido só é ignorado.
- O cookie `eva_contrato` só serve como "último usado": é gravado pelo
  `GET /api/me` depois de validado, e usado nos redirecionamentos de caminhos
  antigos.

`getSessionContext()` / `requirePermission()` / `requireOrgId()` passam a usar
essa resolução — **todas as ~170 rotas existentes que usam `ctx.orgId`
herdam a validação sem mudar uma linha**. `requireOrgId()` vira um atalho de
`getSessionContext()`.

### Rotas do app

- Páginas movidas para `src/app/(app)/[contrato]/**`. Rotas estáticas
  (`/login`, `/signup`, `/admin`, `/ir`, `/api`) têm precedência sobre o
  segmento dinâmico.
- `src/proxy.ts`: caminho antigo (`/negocios/...`, primeiro segmento numa
  lista fixa de seções) → 307 para `/<cookie eva_contrato>/negocios/...`
  (query preservada); sem cookie → `/ir?para=/negocios/...`, que pergunta ao
  `/api/me` o contrato padrão e troca a URL. O layout do contrato valida de
  novo (o cookie é só sugestão).
- Helper único: `src/lib/contrato/rotas.ts` (`rotaDoContrato`,
  `contratoDoCaminho`, `tirarContrato`, `trocarContrato`). Em vez de editar
  150 strings, os componentes importam `Link` de `@/components/contrato/link`
  e `useRouter`/`usePathname` de `@/lib/contrato/navegacao`, que acrescentam
  (e tiram, no caso do pathname) o contrato. `window.location`/`<a href>`
  ficam com `rotaDoContrato` explícito.
- Seletor de contrato no menu: troca o segmento mantendo a página (lista,
  não o registro: `/A/negocios/123` → `/B/negocios`, porque o negócio 123
  não existe em B).

## Permissões

Catálogo em `src/lib/permissoes/catalogo.ts` (sem `server-only`, a tela usa):

| Módulo | Ações |
| --- | --- |
| negocios | ver, criar, editar, apagar, exportar |
| contatos | ver, criar, editar, apagar, importar, exportar |
| empresas | ver, gerenciar |
| conversas | ver, responder |
| tarefas | ver, gerenciar |
| disparos | ver, enviar |
| sequencias | gerenciar |
| agentes | ver, gerenciar |
| funis | configurar |
| produtos | gerenciar |
| relatorios | ver |
| integracoes | gerenciar |
| api | gerenciar |
| membros | gerenciar |
| contrato | gerenciar |

### Camada de compatibilidade

As 6 permissões antigas viram pacotes de granulares:

- `read` → todos os `:ver` (inclui `relatorios:ver`) + `negocios:exportar` (a Leitura sempre baixou a planilha do funil)
- `contacts:manage` → contatos (criar/editar/apagar/importar/exportar), empresas:gerenciar, negocios (criar/editar/apagar), tarefas:gerenciar
- `conversations:reply` → conversas:responder
- `broadcasts:send` → disparos:enviar, sequencias:gerenciar
- `agents:manage` → agentes:gerenciar, funis:configurar, produtos:gerenciar, integracoes:gerenciar, api:gerenciar
- `org:manage` → membros:gerenciar, contrato:gerenciar

Papéis de sistema = união dos pacotes das permissões antigas que tinham →
para owner/admin/agent/viewer o resultado de `requirePermission(<antiga>)` é
**idêntico** ao de antes (teste cobre as 4×6 combinações).

`requirePermission(<antiga>)` para papel personalizado: passa se a pessoa tem
**alguma** granular do pacote (ex.: "só edita negócios" ainda passa nas rotas
de negócios marcadas `contacts:manage`). As rotas sensíveis foram passadas
para granulares (abaixo), onde a conferência é exata.

`requirePermission` aceita antiga **ou** granular (mesma assinatura).

### Papel × grupo × equipe

- **Papel** = o que a pessoa é no contrato (um por pessoa). Sistema (Dono,
  Admin, Atendente, Leitura, só leitura na tela, dá para duplicar) ou
  personalizado.
- **Grupo** = pacote extra de permissões somado ao papel (ex.: "Financeiro",
  "Exportar dados"). Atribuível a papel (todos daquele papel ganham) ou à
  pessoa.
- **Equipe** = gente que trabalha junto (nome, membros, líder). Serve para o
  escopo de dados "da minha equipe".

Escopo de dados (por papel personalizado; sistema = `todos`): negócios,
contatos, conversas. `proprios` = `ownerId`/`assignedToId` = eu; `equipe` =
eu + membros das minhas equipes; `todos` = sem filtro.

Aplicado em: `GET /api/deals` (kanban), `GET/PATCH/DELETE /api/deals/[dealId]`,
`GET /api/deals/exportar`, `GET /api/contacts`, `GET/PATCH/DELETE
/api/contacts/[contactId]`, `GET /api/conversations`. **Falta** (documentado):
dashboard/analytics/insights, empresas, tarefas, linha do tempo, busca da IA,
`/api/inicio`, leads do widget; API v1 (por chave, sem pessoa) não se aplica.

### Superadmin

`EVA_SUPERADMINS` = lista separada por vírgula de e-mails e/ou ids de usuário
Supabase. Superadmin entra em qualquer contrato como Dono (todas as
permissões, escopo `todos`), sem precisar de vínculo; precisa ter conta normal
(Profile). Painel `/admin`: lista de contratos (nome, ID, membros, chaves
ativas), criar contrato, "entrar no contrato".

### Chaves de API

Escopos continuam `*` / `<recurso>:read|write|*` (v1 intacta). A tela mostra
os recursos com nomes do catálogo. Quem cria só pode dar à chave o que ela
mesma pode (`contacts:write` exige `contatos:editar`, etc.; `*` exige tudo) —
sem isso uma chave viraria escalada de privilégio. Expiração opcional
(`expiresAt`); chave vencida = 401. Antes do SQL: sem `expiresAt`/`createdById`
continua funcionando (fallback).

## Rotas afetadas

- Núcleo: `src/lib/server/permissions.ts`, `src/lib/auth/require-org.ts`,
  `src/lib/server/contratos.ts` (novo), `src/proxy.ts`.
- `/api/me` (sessão do contrato + cookie), `/api/contratos` (novo),
  `/api/members` (convite, papel, grupos, equipes, remover), `/api/roles`,
  `/api/permission-groups`, `/api/teams` (novos), `/api/api-keys`,
  `/api/admin/contratos` (novo), `/api/media` (contrato pelo caminho),
  `/api/instagram/oauth/*` (contrato no state).
- Granulares: deals (ver/criar/editar/apagar/exportar), contacts
  (ver/criar/editar/apagar/importar), members (membros:gerenciar), api-keys
  (api:gerenciar), pipelines (funis:configurar), products
  (produtos:gerenciar).
- "Responsável do contrato": `conferirReferencias`, assign de conversa,
  listas de membros (analytics/opcoes, ia/catalogo, fluxos v1) aceitam quem tem
  vínculo ativo.

## Riscos

1. **Vazamento entre contratos** (o maior): toda rota usa `ctx.orgId`. Mitigação:
   o contrato pedido é sempre validado contra vínculo/superadmin no servidor;
   pedido explícito sem acesso = 403 sem fallback; testes cobrem.
2. Remover pessoa do contrato padrão: status `removido` vence o legado.
3. Fetch embrulhado: chamadas feitas por `XMLHttpRequest` (upload do
   compositor) ganham o cabeçalho na mão.
4. Links fora do app (e-mail, favoritos) com caminho antigo: redirecionados.
5. Chave de API com mais poder que quem criou: bloqueado.
6. SQL não aplicado: fallback legado em sessão, membros e chaves.

## Tarefas (TDD)

1. Catálogo + compatibilidade (testes: 4 papéis × 6 antigas idênticos; granular; grupos; custom).
2. Schema + SQL aditivo.
3. `resolverContratoAtivo` + `getSessionContext` (testes: header sem vínculo → 403; header ausente → cookie; cookie inválido → padrão; removido bloqueia legado; superadmin; tabela ausente → legado; duas requisições com contratos diferentes).
4. Rotas puras + fetch + proxy (testes: redirect antigos; header por aba).
5. Mover páginas para `[contrato]`, trocar imports de Link/router.
6. APIs: me, contratos, members, roles, groups, teams, api-keys, admin.
7. Escopo de dados (testes nos GET de deals/contacts).
8. Telas: Configurações (abas), seletor no menu, `/admin`, `/ir`.
9. Suíte inteira, `tsc`, eslint.

## Pendências conhecidas

- Convite de usuário novo usa `inviteUserByEmail` do Supabase: o modelo de
  e-mail/redirect precisa estar configurado no projeto Supabase; a pessoa
  define a senha pelo link.
- Escopo de dados nas telas listadas em "Falta".
