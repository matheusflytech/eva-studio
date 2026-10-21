# Eva Studio: documento de passagem (handoff)

Atualizado em 21/10/2026. Escrito para quem vai continuar o trabalho sem ter
participado das conversas. Tudo o que está aqui foi conferido no código da
branch `feat/dashboards-funil`.

> **Sobre credenciais:** este arquivo fica no repositório, então **não guarda
> nenhum valor secreto** (senha, chave, token). Ele lista **quais** são, **onde
> ficam** e **como obter**. Os valores estão no `.env.local` da máquina de quem
> desenvolve e nas variáveis de ambiente da Vercel. Peça ao Alfredo (Lucas
> Alfredo da Silva) ou ao Matheus.

---

## 1. O que é a Eva Studio

Produto próprio da Eva Holding (site: https://www.evaholdingroup.com.br/).
**Não é o Beeno** e não compartilha nada com ele. É uma plataforma com duas
partes que conversam:

1. **Agentes de IA** que atendem por WhatsApp (oficial e QR), Instagram,
   Messenger, Telegram, TikTok e widget de site, montados num **builder de
   fluxos** visual (blocos ligados).
2. **CRM** completo (contatos, empresas, negócios em funis, tarefas,
   dashboards, réguas, disparos), alimentado pelas conversas dos agentes.

O banco é compartilhado com outro produto, o **Beeno Builder** (sem relação
com o Beeno CRM). Todas as tabelas da Eva usam o prefixo `eva_studio_`.

- Repositório: https://github.com/matheusflytech/eva-studio (dono: Matheus)
- Pasta local usada até aqui: `D:\Skeps\repos\eva-studio`
- Produção atual: `evapp.vercel.app` (Vercel, região `gru1`)

## 2. Regras combinadas (leia antes de mexer)

1. **Nada sobe para o GitHub sem o Alfredo mandar.** Commits locais à vontade;
   push e PR só com autorização, e sempre por PR revisado.
2. **Nunca rodar `prisma db push` em produção.** Ele recria a tabela de chunks
   e derruba o índice vetorial HNSW (ver `prisma/post-migrate.mjs`). Mudança de
   banco é feita com **SQL escrito à mão, só aditivo** (CREATE ... IF NOT
   EXISTS, ADD COLUMN IF NOT EXISTS), revisado, dentro de transação, guardado
   em `prisma/sql/`, e **aplicado só com OK do Alfredo**. Depois de aplicar,
   conferir que o índice HNSW continua lá.
3. **Prefira tabela nova a coluna nova em tabela existente.** Coluna nova em
   tabela que o Prisma lê quebra o app até o SQL ser aplicado. As features
   recentes usam tabelas novas e "leitura tolerante" (o app funciona sem a
   tabela e mostra um aviso). Padrão em `src/lib/server/layout-do-cartao.ts`.
4. **Testes só com mock.** O `.env.local` aponta para o banco de produção.
   Teste manual usa só o agente **"teste"** (`07a3b48f-3bdc-49a5-8c89-692d80d87afc`).
   Nunca mexer nos agentes reais "Vendedor Virtual" e "Landing Interativa".
5. **Não acrescentar camadas não pedidas** (segurança extra, infra, endpoints)
   sem perguntar. Entregar o combinado.
6. Código e comentários em **pt-BR**, finais de linha **LF** (scripts Python
   que reescrevem arquivo viram CRLF: use editor ou `sed -i 's/\r$//'`).
7. Next.js 16 tem mudanças grandes: leia `node_modules/next/dist/docs/` antes de
   criar rota ou página (ver `AGENTS.md`).

## 3. Stack

| Camada | Tecnologia |
|---|---|
| App | Next.js 16.2 (App Router, Turbopack), React 19.2, TypeScript |
| Estilo | Tailwind 4 (`@theme` em `src/app/globals.css`), design system próprio em `src/components/ui` |
| Banco | Postgres no Supabase (projeto `hregdcwbfpxvcmicojds`, região sa-east-1), Prisma 7 com `@prisma/adapter-pg`, client gerado em `src/generated/prisma` |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Builder | React Flow (`@xyflow/react` 12) + `@dagrejs/dagre` (auto-layout) |
| Arrastar | `@dnd-kit` |
| Busca global | `cmdk` (componente em `src/components/ui/command.tsx`) |
| Estado | `zustand` |
| Testes | Vitest 4 (`vitest.config.mts`, alias `@`, stub de `server-only`) |
| Worker WhatsApp QR | Node + Baileys em `worker/` (roda no Render, conexão aberta 24h) |
| Relógio | `pg_cron` + `pg_net` no Supabase chamando `/api/internal/scheduler` (ver `prisma/relogio.sql`) |
| Borda (preparada, não ligada) | Cloudflare Worker em `cloudflare/webhook-ingress/` |

## 4. Como rodar

```bash
npm install                 # roda prisma generate no postinstall
npm run dev                 # http://localhost:3000
npx vitest run              # suíte inteira (~1.400 testes)
npx tsc --noEmit -p .
npx next build              # pare o dev antes (senão dá erro de next/font)
```

- Precisa do `.env.local` (seção 6).
- No Claude Code o servidor sobe por `D:\Skeps\.claude\launch.json`, config "eva-dev".
- Depois de mudar `schema.prisma`, rode `npx prisma generate` **e reinicie o dev**
  (o dev guarda o client antigo em memória e dá "Cannot read properties of
  undefined (reading 'findFirst')").
- Se o `tsc` reclamar de `.next/types` com rotas antigas, rode `npx next build`
  uma vez (regenera os tipos).
- O lint tem ~50 erros antigos (`react-hooks/set-state-in-effect` e afins).
  Regra: não introduzir erro novo.
- **Graphify (mapa do código):** o repositório tem um grafo de conhecimento em
  `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html` para abrir no
  navegador). Antes de procurar no código, pergunte ao grafo:
  `graphify query "onde a etapa do negócio muda"`, `graphify path "A" "B"`,
  `graphify explain "conceito"`. Depois de mexer no código, rode
  `graphify update .` (só AST, sem custo). Regras completas em `CLAUDE.md`.
- **Atenção:** `next.config.ts` tem localmente `allowedDevOrigins:
  ["*.ngrok-free.app"]` (para testar pelo celular com ngrok) e está marcado com
  `git update-index --skip-worktree`. Antes de qualquer PR:
  `git update-index --no-skip-worktree next.config.ts && git checkout -- next.config.ts`.

## 5. Branches e estado do Git

| Branch | O que tem |
|---|---|
| `main` | o que está em produção (último: transcrição/widget) |
| `feat/gatilhos` | Fase 0+1 (gatilhos do Instagram). Já contida na seguinte |
| `feat/lead-de-verdade` | Fase 2 (lead = contato). Já contida na seguinte |
| **`feat/dashboards-funil`** | **branch de trabalho atual**, ~100 commits à frente da `main`, contém tudo |
| `worktree-agent-*` | cópias de trabalho de agentes, já juntadas na `feat/dashboards-funil`; podem ser apagadas (`git worktree remove`) |

Nada foi enviado ao GitHub. Para subir: revisar, reverter o `next.config.ts`
(seção 4), abrir PR da `feat/dashboards-funil` para a `main`.

Não há trabalho pela metade: tudo o que está descrito aqui está commitado na
`feat/dashboards-funil` (último commit de código: `fb22953`, builder). Confira
`git status` antes de começar.

## 6. Credenciais e variáveis de ambiente

Valores: `.env.local` (local) e Vercel → Project → Settings → Environment
Variables (produção). **Nunca** commitar valores.

### App (Next.js)

| Variável | Para quê | Onde obter |
|---|---|---|
| `DATABASE_URL` | Postgres pelo pooler do Supabase (app) | Supabase → Project Settings → Database → Connection string (pooler) |
| `DIRECT_URL` | Postgres direto (scripts, SQL, índices CONCURRENTLY) | idem, conexão direta/sessão (porta 5432) |
| `DATABASE_POOL_MAX`, `DATABASE_FORCE_POOL_TRANSACAO`, `DATABASE_SSL_CA`, `DATABASE_SSL_REJECT_UNAUTHORIZED` | ajuste fino da conexão (opcionais) | `src/lib/db/prisma.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública (publishable) | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | chave de serviço (convites, storage) | Supabase → API (secreta) |
| `TOKEN_ENCRYPTION_KEY` | cifra as credenciais guardadas na tabela `Credential` | gerada uma vez; **trocar quebra as credenciais salvas** |
| `INTERNAL_API_SECRET` | rotas internas (relógio, leads, worker); também no Vault do Supabase como `eva_internal_api_secret` | gerado; mesmo valor na Vercel, no worker e no Vault |
| `NEXT_PUBLIC_APP_URL`, `EVA_STUDIO_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | URLs públicas do app | Vercel |
| `EVA_SUPERADMINS` | e-mails/ids da equipe Eva com acesso a todos os contratos e ao `/admin` | lista separada por vírgula |
| `GROQ_API_KEY` | IA da plataforma (reserva quando o contrato não tem chave; transcrição Whisper) | console.groq.com |
| `META_APP_ID`, `NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID` | WhatsApp oficial (Embedded Signup), webhooks e templates | developers.facebook.com → app da Eva; config id do Embedded Signup |
| `INSTAGRAM_APP_ID`, `NEXT_PUBLIC_INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | login do Instagram | mesmo app Meta, produto Instagram |
| `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_API_BASE`, `TIKTOK_SEND_PATH`, `TIKTOK_REFRESH_PATH` | TikTok | developers.tiktok.com |
| `INGRESS_SIGNING_SECRET` | rota `/api/internal/webhooks` (só quando o Worker da Cloudflare for ligado) | gerar; mesmo valor no Worker |
| `LOG_LEVEL` | nível de log (opcional) | |

Credenciais por contrato (chaves de IA de cada cliente, Resend, MCP) ficam
**cifradas no banco** (tabela `eva_studio_credentials`), cadastradas pela tela,
não em variável de ambiente.

### Worker WhatsApp QR (`worker/`, Render)

`DATABASE_URL`, `INTERNAL_API_SECRET`, `EVA_STUDIO_URL`, `PORT`. Ver
`worker/README.md` e `worker/META_SETUP.md`.

### Cloudflare Worker (`cloudflare/webhook-ingress/`, ainda não implantado)

Segredos via `wrangler secret put`: `META_APP_SECRET`,
`META_WEBHOOK_VERIFY_TOKEN`, `TELEGRAM_SECRET_TOKEN` e `TIKTOK_WEBHOOK_TOKEN`
(= `INTERNAL_API_SECRET`), `INGRESS_SIGNING_SECRET`. Vars: `APP_URL`, KV
`DEDUPE`, filas `FILA_ENTRADA` e `FILA_MORTA`. Ver o README da pasta.

### Pendências de segurança

- **Trocar a senha do banco** e o **app secret do app Meta de teste
  ("Eva Teste-IG")**: os dois foram colados em conversa durante o
  desenvolvimento.
- O app Meta de teste "Eva Teste-IG" ainda existe (trabalho de Instagram
  pausado).

## 7. Mapa do código

```
src/
  app/
    (auth)/                 login, cadastro
    (app)/[contrato]/       todas as telas, com o ID do contrato na URL
      inicio, conversas, negocios (+ [dealId], configurar, relatorio),
      contatos, empresas, tarefas, dashboard, leads, sequencias, disparos,
      aprovacoes, biblioteca, agent-studio (+ [agentId]/builder), playground,
      integracoes (+ api/referencia), configuracoes, ajuda, insights, comecar
    (app)/design-system/    vitrine viva do design system
    contratos/              "Olá, qual contrato deseja acessar?"
    admin/                  painel de superadmin
    ir/                     redireciona caminhos antigos para /<contrato>/...
    api/                    rotas internas (sessão) — ver abaixo
    api/v1/                 API pública (chave de API) + openapi.json
  components/
    ui/                     design system (Button, DataTable, Pagination,
                            FilterButton, ViewTabs, KanbanColumn, Command,
                            Toast, BulkActionBar, ...)
    crm/negocios/           quadro, cartão, prévia, voz da Eva (estilos 1/2/3)
    crm/negocio/            ficha do negócio
    crm/config/             editores de funis, regras, campos, cartão, produtos
    agent-studio/           agente e builder
    dashboard/, tarefas/, busca/, configuracoes/, integrations/, whatsapp/, ...
  lib/
    server/                 regra de negócio do servidor (ver tabela abaixo)
    server/api-v1/          implementação da API pública
    server/ia/              IA de filtros, réguas e fluxos; escolha de provedor
    permissoes/catalogo.ts  catálogo de permissões granulares
    contrato/               rotas com contrato e fetch que manda o cabeçalho
    design-system/          tokens, tema, contraste, paginação
    filtro-crm.ts, consulta.ts, cartao-layout.ts, regras-de-etapa.ts, ...
  generated/prisma/         client gerado (não editar)
prisma/
  schema.prisma             66 models
  sql/                      SQLs aditivos aplicados à mão (seção 8)
  post-migrate.mjs          recria o índice HNSW depois de db push
  relogio.sql               pg_cron do relógio
worker/                     WhatsApp QR (Baileys) + fila
cloudflare/webhook-ingress/ Worker de borda (preparado)
scripts/                    seed-demo-crm.mjs, backfill-stage-events.mjs
docs/                       este arquivo, planos, design system, arquitetura
```

### Arquivos-chave do servidor (`src/lib/server/`)

| Arquivo | Responsabilidade |
|---|---|
| `permissions.ts`, `contratos.ts`, `membros.ts`, `papeis.ts`, `escopo-dados.ts` | sessão, contrato ativo (URL/cabeçalho `x-eva-contrato`/cookie `eva_contrato`), vínculo, papéis, "só os meus/equipe/todos" |
| `crm.ts` | `createDeal`, `moveDealStage` (**único ponto** que muda etapa e aplica as regras) |
| `regras-de-etapa.ts`, `atividade-do-negocio.ts`, `stage-events.ts` | obrigatórios por etapa, motivos de perda, parado por etapa, `tocarAtividade`, histórico |
| `filtro-crm.ts`, `listas-crm.ts`, `quadro-negocios.ts` | motor de filtro único (contatos/negócios), listas paginadas, quadro por coluna |
| `visoes-salvas.ts`, `lote.ts`, `lote-http.ts` | visões salvas e ações em massa (prévia, desfazer) |
| `lixeira.ts` | lixeira de 30 dias por "foto" e restauração |
| `tarefas.ts`, `tarefas-detalhes.ts`, `meu-dia.ts` | tarefas, conclusão com próximo passo, Meu dia |
| `busca.ts` | busca global (Ctrl+K) |
| `produtos.ts` | catálogo e itens do negócio |
| `consulta.ts`, `analytics.ts`, `funil-dados.ts` | dashboard e montador de cartões |
| `flow-engine.ts` | motor de fluxos dos agentes |
| `llm.ts`, `ia/provedor.ts` | chamadas de LLM e escolha de provedor/chave |
| `outbound.ts`, `broadcast-runner.ts`, `agendamento.ts`, `sequences.ts` | envio, disparos, mensagens agendadas, réguas |
| `meta-graph.ts`, `meta-templates.ts`, `meta-template-eventos.ts` | Graph API, criação e status de templates |
| `api-validacao.ts` | validação comum das rotas (corpo, datas, dinheiro, ids da org) |
| `api-keys.ts`, `rate-limit.ts` | chaves de API e limites |

## 8. Banco: SQLs aplicados em produção

Todos em `prisma/sql/`, aplicados à mão com OK, em transação; o índice HNSW
foi conferido depois de cada um.

| Arquivo | O que faz | Status |
|---|---|---|
| (antes) `eva_studio_agent_triggers` | gatilhos do Instagram | aplicado |
| `2026-10-19-contact-lead.sql` | colunas de lead no contato | aplicado |
| `2026-10-19-deal-stage-events.sql` | histórico de etapa (+ backfill de 4 negócios) | aplicado |
| `2026-10-20-pipeline-card-layouts.sql` | layout do cartão por funil | aplicado |
| `2026-10-20-produtos.sql` | produtos, itens, valor manual | aplicado |
| `2026-10-20-api-v1.sql` | escopos de chave, idempotência, refs externas, lápides, jobs em lote, versões de fluxo | aplicado |
| `2026-10-20-whatsapp-agendamento-templates.sql` | status de template, mensagem avulsa, trava da fila | aplicado |
| `2026-10-20-contratos-permissoes.sql` | vínculos, papéis, grupos, equipes, colunas das chaves (+ backfill dos vínculos) | aplicado |
| `2026-10-20-regras-de-etapa.sql` | regras por etapa, motivos de perda, perda estruturada, última atividade | aplicado |
| `2026-10-20-lixeira.sql` | lixeira | aplicado |
| `2026-10-20-tarefas.sql` | detalhes da tarefa | aplicado |
| `2026-10-20-busca.sql` | unaccent, pg_trgm, função de normalização, 11 índices GIN (criados CONCURRENTLY) | aplicado |
| `2026-10-20-visoes-salvas.sql` | visões salvas e padrão por pessoa | aplicado |
| `2026-10-20-indices-listas.sql` | 6 índices de listas (contatos e negócios) | **não aplicado** (base pequena; aplicar CONCURRENTLY quando crescer) |
| `2026-10-21-conexao-ia.sql` | Central de IA: conexão única com ordem e reserva | **não aplicado** (app funciona sem; usa a escolha automática) |
| `2026-10-21-uso-ia.sql` | Central de IA: uso por chamada e limite/preço por chave | **não aplicado** (app funciona sem; não conta uso) |
| `2026-10-22-canais-do-contrato.sql` | Canais do contrato + sessão do QR por canal, com migração das conexões atuais | aplicado em 21/10 (migrou 1 canal: o QR do Vendedor Virtual, em qr_pending, sem credenciais). Rodado 2x para provar que não duplica. App e worker em produção ainda são os antigos (modo por agente) até o deploy |

Para aplicar um SQL novo: script Node com `pg` usando `DIRECT_URL`, rodando o
arquivo, depois conferindo as tabelas e `select count(*) from pg_indexes where
indexdef ilike '%hnsw%'` (= 1).

**Dados de teste em produção (org "Eva Holding",
`8d8d3a8c-2ff6-485e-a325-17384e9990cf`):**
- Dados simulados `[DEMO]`: 3 funis, 13 campos, 4 etiquetas, 28 empresas, 70
  contatos, 125 negócios. Para remover só eles:
  `node scripts/seed-demo-crm.mjs --org 8d8d3a8c-2ff6-485e-a325-17384e9990cf --remover`
- Dois negócios "[TESTE] Funil A" e "[TESTE] Funil B" — apagar depois da revisão.

## 9. O que foi feito, e por quê

A ordem segue as conversas com o Alfredo. Planos detalhados em
`docs/superpowers/plans/`.

### Agentes e canais
- **Gatilhos do Instagram** (palavra-chave na DM, resposta e menção em story),
  assinatura automática dos eventos. *Por quê:* pedido do to-do de ManyChat.
- **Lead de verdade:** lead passou a ser um contato com `leadStage`; leads do
  WhatsApp/Instagram aparecem em /leads. Bloco Captura valida nome, e-mail,
  telefone, com novas tentativas e saída de "resposta inválida".

### CRM
- **Revisão de todas as APIs do CRM:** isolamento por organização em todo id
  vindo do corpo, 400 em vez de 500 para entrada inválida, segmento por canal,
  telefone normalizado, importação CSV com `;`. *Por quê:* pedido "100%
  funcional".
- **Dashboards do funil:** conversão, dias por etapa, parados, motivos de
  perda, taxa de ganho, ciclo; histórico de etapa em todo movimento.
- **Negócios redesenhado:** quadro por coluna paginado, cartão personalizável
  por funil, prévia ao clicar, ficha completa do negócio (`/negocios/<id>`) com
  linha do tempo e vínculos, exportação CSV/PDF, IA no dashboard.
- **Três estilos "Eva"** no Negócios (recado da Eva, quadro humanizado,
  "desde ontem / pede sua atenção hoje"), escolha no seletor de estilo. *Por
  quê:* tirar a "cara de IA"; os três ficam a pedido do Alfredo.
- **Produtos no negócio** (catálogo, itens, valor pela soma, MRR/ARR).
- **API pública v1** (contatos, empresas, negócios, funis, tarefas, notas,
  fluxos, réguas, importação/exportação em lote, idempotência, dedupe por
  external_id/e-mail/telefone, OpenAPI em `/api/v1/openapi.json`, referência em
  Integrações → API).
- **WhatsApp:** contagem dobrada no QR corrigida, trava da fila, disparo
  agendado claro, mensagem avulsa agendada, criação de template na Meta com
  prévia, status de aprovação pelo webhook.
- **Contratos e permissões:** ID do contrato na URL, pessoa em N contratos,
  escolha de contrato, superadmin, papéis personalizados, grupos, equipes,
  escopo de dados, chaves de API por contrato com escopos e validade.
- **Design system** (`docs/design-system.md`, vitrine em `/design-system`):
  tokens claro/escuro, identidade da Eva (navy, azul `#308ce8`, Plus Jakarta nos
  títulos, Inter no corpo), componentes de lista e quadro. Tema padrão claro com
  menu lateral navy. *Por quê:* "cara de IA" e falta de sistema.
- **Listas no padrão de CRM de mercado:** motor de filtro único, filtros em
  linha, filtros avançados E/OU, colunas editáveis, telefone com bandeira,
  paginação numerada, quadro com Total/Ponderado e recolher coluna.
- **Melhorias guiadas pelas skills `crm-*`** (lista em
  `docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md`):
  1. regras por etapa (obrigatórios, reabrir, motivos de perda, parado por etapa, orientação);
  2. lixeira de 30 dias + desfazer;
  3. tarefas (tipos, conclusão com próximo passo, adiar, criar por texto, Meu dia, filas);
  4. busca global Ctrl+K (~90 ms com índices);
  5. visões salvas + ações em massa com prévia e desfazer.

### Tema e builder (F1 e F2)
- **Tema:** Configurações → "Sua conta" escolhe Claro / Escuro / Seguir o
  sistema e "Canvas do builder sempre escuro"; atalho no rodapé do menu
  lateral (que fica navy nos dois temas). Lógica em
  `src/lib/design-system/theme.ts` e `src/components/ui/theme.tsx`
  (`ThemeChooser`, `useCanvasTheme`). Paleta de "cores de categoria" (12 cores
  com contraste AA nos dois temas) em `src/lib/design-system/category-classes.ts`,
  usada pelos blocos do builder.
- **Builder:** rótulo ao lado de cada saída (Sim/Não, opções do menu,
  Respondeu/Não respondeu certo) e também na ligação; bloco novo entra pela
  saída livre certa; "+" da ligação sem ferramentas; validação com erro/aviso
  (ramos, opções soltas, saída inexistente, bloco inalcançável, "Enviar para meu
  fluxo" sem URL), usada também no salvamento interno e na API v1;
  **auto-layout esquerda→direita com `@dagrejs/dagre`** (botão "Organizar",
  fluxos da API v1 sem posição ou sobrepostos, IA e modelos prontos); canvas
  com `colorMode`. Código morto e o "webhook de entrada" falso foram removidos;
  "Canal principal", "Habilidades" e "Ferramentas do n8n" estão escondidos (os
  campos continuam no banco; a F3 decide).
- **Saída depois da IA (decisão):** sem ligação, a conversa fica no bloco de
  IA como antes. Com ligação, o fluxo segue na mesma rodada quando o bloco
  termina: "Responder com IA" termina ao coletar os dados pedidos ou ao chamar
  a ferramenta interna `seguir_fluxo` (só oferecida quando há ligação);
  "Enviar para meu fluxo" termina quando o webhook responde `done: true`. Erro
  nunca pula a etapa.

### Infra
- **Cloudflare:** arquitetura alvo em `docs/arquitetura-cloudflare.md` e Worker
  de entrada de webhooks pronto (não implantado). Rota
  `/api/internal/webhooks` no app recebe dele.

## 10. Próximos passos mapeados

### Conferência pendente
- F1 e F2 passaram em testes, `tsc` e build, mas **ainda não foram vistas no
  navegador** (builder do agente "teste" nos dois temas).

### Canais do contrato (F4) — feito em 21/10, local
Plano: `docs/superpowers/plans/2026-10-21-canais-do-contrato.md`.
- **Configurações → Canais** só conecta e desconecta (vários números e contas de cada tipo).
- **O agente escolhe o canal**, na aba Canais dele, um de cada tipo; cada canal tem um agente só.
- **Credenciais:** a conexão fica em `eva_studio_canais`. O agente que atende recebe uma cópia na tabela de
  sempre (`MetaConnection`...), então entrada, envios e disparos não mudaram (`src/lib/server/canais/`).
- **Worker do QR:** abre uma sessão por canal (`worker/fonte.js`, ver `worker/README.md`).
- **Telegram e TikTok:** ganharam entrada por canal; as rotas antigas por agente continuam.
- **Canal sem agente:** fica em "atenção" e o Início avisa; a conversa não é guardada.
- **Pendentes:**
  - testar ponta a ponta com o agente "teste" (QR no worker, Telegram, Instagram);
  - CHATBOT_ENGINE ainda descreve os canais por agente;
  - templates da Meta e automações do Instagram continuam por agente.

### Também em 21/10
- **Página completa do contato** (`/contatos/<id>`, `pagina-do-contato.tsx`): dados editáveis, história
  (linha do tempo do contato em `/api/contacts/[contactId]/linha-do-tempo`, mesmo formato da do negócio),
  negócios, conversas e réguas. A gaveta da lista tem "Abrir página completa".
- **Contatos:** atalho do WhatsApp Web ao lado do celular.
- **Modelos prontos:** "Atendimento com menu" e "FAQ com IA" usam Responder com IA (Central) com a saída
  Erro no atendente. Modelo novo "Atendimento pelo n8n", que pede a URL na criação do agente. O bloco do n8n
  agora se chama "Enviar para o n8n".

### Próximas frentes (`docs/superpowers/plans/2026-10-20-builder-agentes-integracoes.md`)
- **F3 Central de IA — partes a, b e c feitas em 21/10** (prompt do agente no
  bloco, saída "Erro", modelos pela chave, conexão única com reserva, uso e
  limite por chave; detalhes nas notas do plano). Os dois SQLs de 21/10 não
  foram aplicados. Também feitos: "Entrar com OpenRouter" (OAuth PKCE) e
  criação de agente em etapas, que já nasce com o fluxo inicial.
  Texto original da frente: o cliente conecta várias chaves de IA (OpenAI,
  Google, xAI, Anthropic, etc.) e os agentes usam **uma conexão única** com
  ordem de preferência e **reserva automática**; modelos GPT-5.6 Luna (id
  configurável), Gemini 2.0/2.5 Flash, Grok, Claude Haiku; login no provedor
  onde existir; uso/custo por chave; criação de agente em etapas; o bloco de IA
  passa a usar as instruções, o tom e o "nunca deve fazer" do agente (hoje
  ignora); saída de erro no bloco de IA; destino de "Canal principal",
  "Habilidades" e "Ferramentas do n8n". Encaixa no AI Gateway da Cloudflare.
- **F4 Integrações em aba própria** (Configurações): BM/Meta, WhatsApp, Instagram,
  Messenger, Telegram, TikTok, widget, e-mail, n8n, IA, MCP, no nível do
  contrato, com **logos das marcas**; agente só escolhe os canais.
- **F5 E-mail automático** com Resend: domínio, modelos, passo de e-mail nas
  réguas e no fluxo, disparo de e-mail.
- **F6 n8n:** webhooks de saída do CRM (eventos, HMAC, tentativas, log),
  tela com a logo do n8n, webhook de entrada de verdade (o atual da tela é
  falso), nó da Eva para o n8n.
- **F7 Cloudflare fases 2–4:** fila de saída, Durable Objects por conversa,
  AI Gateway, Hyperdrive. Para ligar a fase 1: conta paga (US$ 5/mês), segredos,
  trocar callback na Meta (ver README do Worker).

### Melhorias do CRM ainda abertas (`melhorias-crm-skills.md`)
- P0: 6 mesclar duplicados; 7 CNPJ que se preenche (BrasilAPI) e telefone
  E.164; 8 auditoria; 9 IA que resume e sugere campos com aprovação; 10 metas e
  painel vendedor/gestor; 11 sinais de risco.
- P1: webhooks de saída; caixa de leads com SLA e rodízio; assistente de
  importação; previsão por categoria; áudio do WhatsApp → CRM; aprovações;
  réguas que param ao responder; biblioteca; Google Agenda; LGPD; RLS como
  segunda trava; disparos com custo e canário.
- P2: Pix/boleto no chat; ERPs; nó n8n; colunas de IA; objetos personalizados;
  modelos por vertical.

### Outras pendências conhecidas
- Aplicar `2026-10-20-indices-listas.sql` quando a base crescer.
- Pendências citadas nas notas de cada item (ex.: tarefa/nota sem lixeira,
  "editar campo" em massa, ações em massa no quadro, recorrência de tarefa,
  expediente configurável, template de autenticação da Meta não envia,
  reagendar mensagem avulsa pela tela, escopo de dados em dashboard/empresas;
  telas fora do builder, como o inbox, ainda têm `text-white`/hex soltos e
  dependem da ponte de cores do tema).
- Roadmaps antigos ainda abertos: prospecção por CNAE/CNPJ (pedido do Lucas),
  peças restantes de ManyChat, marketing (Google/Meta Ads,
  `2026-10-18-marketing-integracoes-roadmap.md`), spike do Instagram.
- Remover `[DEMO]` e `[TESTE]` de produção quando não forem mais úteis.
- Trocar senha do banco e app secret de teste (seção 6).

## 11. Documentos de referência

| Documento | Conteúdo |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | aviso sobre o Next.js 16 |
| `docs/CHATBOT_ENGINE.md` | como o motor de fluxos funciona |
| `docs/design-system.md` | princípios, tokens, componentes, "não fazer" |
| `docs/arquitetura-cloudflare.md` | arquitetura alvo, custos, migração |
| `docs/meta-business-runbook.html` | passo a passo da Meta |
| `worker/README.md`, `worker/META_SETUP.md` | worker do WhatsApp |
| `cloudflare/webhook-ingress/README.md` | deploy do Worker |
| `docs/superpowers/plans/*.md` | planos de cada frente, com notas do que foi feito |
| `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html` | mapa do código gerado pelo graphify (comunidades, nós centrais, relações) |

Skills usadas no desenvolvimento (Claude Code, em `C:\Users\skwcx\.claude\skills`):
`crm-mvp-blueprint` (índice) e as `crm-*` (pipeline, data-model, tasks,
list-views, ai-copilot, whatsapp, automation-builder-ui, ai-flow-nodes...),
`supabase-postgres-best-practices`, `shadcn`, `react-flow`, `ui-ux-pro-max`.
