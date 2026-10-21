# Plano: tema escuro, builder, agentes de IA, integrações, e-mail, n8n e Cloudflare

Data: 2026-10-20. Pedido do Alfredo, a partir do mapa do código (agente de
leitura, mesmo dia). Produto: Eva Studio. Tudo local até ele autorizar PR;
banco só aditivo e com OK.

## Diagnóstico (resumo do mapa)

- **Builder:** saídas dos blocos "Responder com IA" e "Enviar para meu fluxo"
  nunca são seguidas; "+" no meio da ligação oferece ferramentas (quebra o
  fluxo) e usa nomes antigos; adicionar depois de Condição/menu cria ligação
  sem `sourceHandle` (a conversa morre); "Sim/Não" e opções de menu não ficam
  alinhados aos pontos; ligações sem rótulo; validação não pega ramo faltando;
  fluxo vindo da API v1 empilha tudo em (0,0); IA e modelos montam na vertical
  com portas horizontais; salvamento interno não valida; cores fixas por bloco
  (Início invisível no claro); exemplo com menu sem opções.
- **IA do agente:** o bloco de IA ignora instruções/tom/"nunca deve fazer" do
  agente; provedor e modelo só no bloco; sem reserva de chave; tela de
  Integrações só oferece Groq e Resend; "Habilidades", "Ferramentas do n8n" e
  "Canal principal" são decorativos.
- **Canais:** todos dentro da aba Canais de cada agente; nenhuma conexão de BM
  no nível do contrato; nenhum logo de marca.
- **E-mail:** só o bloco "Enviar e-mail" (Resend, texto livre, um
  destinatário); nada em réguas, disparos, modelos, domínio.
- **n8n:** só o webhook de saída do agente; o "webhook de entrada" mostrado na
  tela é falso; sem eventos do CRM, sem nó, sem tela.
- **Tema:** existe claro/escuro no design system, mas não há onde trocar.

## Frentes (uma por vez, com a skill certa)

| # | Frente | Entrega | Skills |
|---|---|---|---|
| F1 | **Tema escuro** | Troca de tema em Configurações → Sua conta e no rodapé do menu; builder e blocos com tokens nos dois temas (canvas escuro no tema escuro; opção "canvas sempre escuro") | crm-design-system, shadcn |
| F2 | **Builder confiável e organizado** | Corrigir os bugs acima; rótulos de saída ao lado de cada ponto e nas ligações; menu "+" só com blocos válidos; validação de ramos/opções/ids; **auto-layout esquerda→direita** com altura real dos cartões (dagre ou elk), aplicado ao salvar pela API v1, pela IA e nos modelos; salvamento interno validado; limpar código morto e campos decorativos | crm-design-system, shadcn |
| F3 | **Central de IA** | Várias chaves por contrato (todos os provedores do catálogo), **uma conexão única** para os agentes com ordem de preferência e **reserva automática** (falha, lentidão, limite); modelos: GPT-5.6 Luna (id configurável), Gemini 2.0 Flash e 2.5 Flash, Grok, Claude Haiku, além dos atuais; login no provedor onde existir (OpenRouter tem OAuth PKCE; os demais por chave), uso e custo por chave/agente com limite; criação de agente em etapas com modelo no agente e o bloco de IA usando as instruções do agente | crm-ai-copilot, shadcn |
| F4 | **Integrações em aba própria** | Configurações → Integrações: conexão do BM/Meta, WhatsApp oficial e QR, Instagram, Messenger, Telegram, TikTok, widget, e-mail, n8n, chaves de IA, MCP — no nível do contrato, com **logos das marcas**; o agente só escolhe quais canais usa; catálogo de integrações "nativas" | crm-whatsapp-channel, crm-brazil-integrations, shadcn |
| F5 | **E-mail automático** | Resend (gratuito até 3 mil/mês, escala) com verificação de domínio, modelos com variáveis, passo de e-mail nas réguas e no fluxo, disparo de e-mail, eventos de entrega | crm-sequences, crm-content-library, crm-broadcasts |
| F6 | **n8n fácil** | Webhooks de saída do CRM (API-6: catálogo de eventos, HMAC, tentativas, log, reenviar); tela n8n com a logo, passo a passo e testes; webhook de entrada de verdade (substitui o falso); pacote do nó da Eva para o n8n (community node) e modelos de workflow | crm-n8n-integration, crm-api-webhooks |
| F7 | **Cloudflare** ✅ (local, sem deploy) | Documento de arquitetura escalável (Workers, Queues, KV/D1/R2, Durable Objects para sessões, custos e limites) e a primeira peça: entrada de webhooks (Meta, Telegram, TikTok) num Worker com fila, entregando ao app | crm-whatsapp-channel, crm-api-webhooks |

Ordem: F1 → F2 → F3 → F4 → F5 → F6, com F7 em paralelo (pasta própria).

## Notas de execução

### F7 — Cloudflare (2026-10-20, local, sem deploy)

- Documento: `docs/arquitetura-cloudflare.md` (alvo, fluxos, limites, custos
  1k/100k/1M com fontes, riscos, fases com volta, por que o Baileys fica fora).
- Peça 1: `cloudflare/webhook-ingress/` (Worker + Queue + KV, `package.json`
  próprio, testes no workerd com `@cloudflare/vitest-plugin`). Mesmos caminhos
  do app (`/api/webhooks/...`): ligar/desligar = trocar a URL de callback.
- App: rota nova `src/app/api/internal/webhooks/route.ts` (HMAC
  `INGRESS_SIGNING_SECRET`, 5 min) que chama os **handlers exportados** das
  rotas atuais — nenhuma rota existente foi alterada.
- Pendente do dono: conta Cloudflare (Workers Paid), domínio opcional,
  segredos (`wrangler secret put`) e `INGRESS_SIGNING_SECRET` na Vercel.
- Pendente técnico: dedupe no app para Telegram/TikTok (ou DO por conversa,
  fase 3); fases 2–4 do documento.

## Andamento

### F1 — Tema escuro: FEITO (20/10/2026)

- Troca em **Configurações → Sua conta** (aba nova; nome, Aparência, Sessão):
  Claro / Escuro / Seguir o sistema (`ThemeChooser`) e "Canvas do builder
  sempre escuro" (`useCanvasTheme`, localStorage `eva-canvas`, lógica pura
  em `theme.ts` com teste). Atalho `ThemeToggle` no rodapé do menu lateral,
  que segue navy nos dois temas.
- **Cores de categoria** no design system: 12 cores × (fg, subtle, solid) ×
  (claro, escuro), `--cat-*` no globals.css + `CATEGORY_THEMES` (tokens.ts) +
  `CATEGORY_CLASSES`; teste de contraste (fg ≥ 4,5 em subtle/panel/raised,
  solid ≥ 3) e de espelho CSS↔TS. Documentado em docs/design-system.md.
- Migrados para tokens: block-styles (Início deixou de ser branco no claro),
  flow-node, flow-edge, node-inspector, issues-panel, montar-com-ia,
  executions-panel, capture-config, flow-template-gallery,
  agent-operations-card, agent-resumo, lista de agentes, referência da API.
  O celular da prévia (conversation-mode) ficou `data-theme="dark"` fixo.
- Ponte de cores do globals.css: agora cobre violet/purple/teal/cyan/orange/
  indigo/slate (→ cores de categoria) e vale nos dois temas (variável CSS
  herda resolvida; trecho escuro dentro da página clara herdava a cor clara).
- Fica para depois: telas fora do builder com `text-white`/hex (inbox,
  relatório de negócios — este é de outra frente) seguem pela ponte.

### F2 — Builder confiável e organizado: FEITO (20/10/2026)

- **Saídas de IA/fluxo externo** (flow-engine.ts): sem ligação, a conversa
  fica com o bloco (como antes). Com ligação, segue **na mesma rodada**,
  logo após a resposta, quando o bloco termina: "Responder com IA" coletou
  todos os dados pedidos ou chamou a ferramenta interna `seguir_fluxo` (só
  oferecida quando há ligação); "Enviar para meu fluxo" respondeu
  `{ "done": true }`. Erro nunca pula a etapa. Testado em
  flow-engine.saidas-ia.test.ts.
- **Saídas legíveis**: `builder/saidas.ts` é a fonte única (cartão, ligação,
  layout, validação, bloco novo). Cada saída nomeada tem linha própria com o
  ponto alinhado; pílula com o nome no meio da ligação; cor por tipo
  (`saida-estilo.ts`). `useUpdateNodeInternals` ao mudar as saídas.
- **Ligações**: bloco novo depois de Condição/menu/pergunta validada sai pela
  primeira saída livre; menu "+" da ligação sem ferramentas, com os nomes e
  grupos da paleta; `isValidConnection`: ferramenta só na porta de
  ferramentas e nada além de ferramenta nela; apagar opção apaga a ligação
  presa nela.
- **Validação** (block-validation.ts, com `nivel` erro/aviso): condição com
  os dois ramos, captura validada com "Respondeu", opção de menu solta
  (aviso), saída inexistente, bloco sem caminho do Início (aviso), "Enviar
  para meu fluxo" sem URL no agente. `/api/flows/[agentId]` valida com
  `validarFluxo` da API v1 em modo "builder" (estrutura quebrada bloqueia,
  bloco pela metade vira aviso — o canvas salva enquanto se monta); API v1
  em modo "api" (erros bloqueiam, avisos voltam em `warnings`).
- **Auto-layout** esquerda→direita com `@dagrejs/dagre` 3.1.1 (síncrono, o do
  exemplo do React Flow; elkjs é assíncrono e ~1,4 MB): altura medida ou
  estimada, constraints de ordem (Sim em cima, opções na ordem),
  ferramentas embaixo do bloco de IA, determinístico. Usado no botão
  "Organizar", na API v1 (sem position ou sobreposto), na IA (montar e
  acrescentar) e nos modelos prontos/exemplo (menu do exemplo ganhou opções).
- **Limpeza**: removidos agent-grid, agent-card, checkpoint-card,
  checkpoint-rail, builder/types.ts e o "webhook de entrada" falso (texto
  honesto no lugar). Canal principal, Habilidades e Ferramentas do n8n
  escondidos (`MOSTRAR_CAMPOS_DECORATIVOS`), campos do banco intactos.

### F3 — Central de IA: partes a, b e c FEITAS (21/10/2026, local)

Skills: crm-ai-flow-nodes, crm-ai-copilot. Decisões do Alfredo: dividir em
partes; SQL escrito e não aplicado; modelos vêm da chave do cliente; campos
escondidos (Canal principal, Habilidades, Ferramentas do n8n) continuam
escondidos (F4 e F6 decidem).

- **F3a — bloco de IA** (sem banco):
  - prompt montado do cadastro do agente (`ia/prompt-do-agente.ts`):
    identidade, instruções, tom, idioma, "nunca faça", regras de não
    inventar e de tratar a mensagem do cliente como dado, e o texto do
    bloco como "nesta etapa". O que é fixo vem primeiro (cache de prompt).
    Agente vazio = só o texto do bloco, como antes. Chave
    `aiUsarAgente` no bloco para desligar;
  - saídas "Terminou" (sem id, ligações antigas valem) e "Erro"
    (`SAIDA_ERRO`). Com "Erro" ligada, a falha segue por ela na mesma
    rodada; sem ligação, fica no bloco. A validação avisa quando "Erro"
    está solta. Início e visão dos agentes passaram a contar só erros
    como "bloco incompleto";
  - modelos listados pela chave do cliente (`ia/modelos-da-chave.ts`,
    `GET /api/credentials/[id]/models`), filtrados para modelos de
    conversa, com o catálogo fixo como reserva e "Outro" para digitar o id.
- **F3b — conexão única** (`ia/conexao.ts`, `ia/reserva.ts`, tabela
  `eva_studio_ai_connections`, SQL `2026-10-21-conexao-ia.sql` NÃO
  aplicado): lista de chave + modelo em ordem, com tempo limite por
  tentativa (`timeoutMs` novo em `llm.ts`). A reserva passa para a próxima
  em falha do provedor, resposta vazia ou tempo estourado; não repete se a
  IA já executou ferramenta, nem em recusa do modelo. Bloco: "De onde vem
  a IA" (`fonte-da-ia.ts`): bloco antigo com credencial continua com ela;
  sem credencial, usa a Central (antes falhava). Sem tabela ou sem nada
  salvo, vale a escolha automática de `ia/provedor.ts`. Integrações:
  painel Central de IA; credenciais para todos os provedores.
- **F3c — uso e limite** (`ia/uso.ts`, tabelas `eva_studio_ai_usage` e
  `eva_studio_ai_key_limits`, SQL `2026-10-21-uso-ia.sql` NÃO aplicado):
  tokens informados pelo provedor em cada tentativa (bloco de IA,
  dashboard, rascunhos por IA), mês no horário de Brasília, limite mensal
  em tokens por chave (estourou, sai da fila; alerta a partir de 80%),
  custo em R$ pelo preço por 1 milhão de tokens que o cliente informa.
  Painel "Uso de IA neste mês" por chave e por agente.

Achado: a chave Groq do contrato Eva Holding não lista
`llama-3.3-70b-versatile`, que é o padrão do catálogo e de
`MODELO_POR_PROVEDOR.groq` (reserva da plataforma). Conferir na Groq se o
modelo saiu; se saiu, trocar o padrão.

- **F3d — Entrar com OpenRouter** (`ia/openrouter-oauth.ts`,
  `/api/ia/openrouter/start` e `/callback`): OAuth PKCE S256. Verificador e
  state num cookie httpOnly de 10 min (caminho `/api/ia/openrouter`), só o
  desafio vai ao OpenRouter; na volta confere o state em tempo constante,
  troca o código em `POST /api/v1/auth/keys` e grava Credential
  `openrouter` cifrada. Botão em Integrações → Credenciais. Login real não
  testado (precisa de conta OpenRouter); rotas e PKCE cobertos por teste.
- **F3e — criação de agente em etapas** (`novo-agente-etapas.tsx`,
  `builder/fluxo-inicial.ts`): quem é → como fala → qual IA (Central ou
  chave + modelo só dele) → como começa (atendente com IA, em branco ou
  modelo pronto). Cria o agente e o fluxo e abre o builder. O "modelo no
  agente" fica no bloco de IA do fluxo inicial (sem coluna nova no agente).
  Edição continua no formulário completo.

Achado: os modelos prontos (`flow-templates.ts`) usam o bloco "Enviar para
meu fluxo" (n8n) com o rótulo "Agente de IA"; sem URL do fluxo ele dá erro
(é o erro do agente "teste"). Vale trocar por "Responder com IA".

Falta da F3: descrição de `seguir_fluxo` no prompt-base (pequeno).

### Pendências para a F3 (anteriores)

- Decidir o destino de Canal principal / Habilidades / Ferramentas do n8n.
- O bloco de IA ainda ignora instruções/tom/"nunca fazer" do agente; a
  descrição da ferramenta `seguir_fluxo` pode ir para o prompt-base quando a
  F3 montar as instruções do agente.
- Saída de erro/fallback do bloco de IA (hoje erro só registra e fica).
