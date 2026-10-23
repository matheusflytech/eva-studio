# Plano v6 do front do EvaApp (para a próxima sessão)

## >>> ROTEIRO DO DONO (23/10/2026): foco agora é FUNCIONALIDADE <<<

O front ficou bonito; agora tudo tem que funcionar. Ordem:
1. Testar de verdade nas automações: FEITO, PR #9 no ar (registro de teste que
   cumpre gatilho e condições, passos de verdade, esperas de 10 s, quadro
   acendendo, "Apagar dados do teste"; eventos de teste não disparam outras
   automações nem webhooks).
2. Revisão geral de TODAS as funções: FEITA em 23/10 (CRM, Caixa de entrada,
   Automações e réguas, Agentes; leitura e escrita, dados de teste apagados).
   Não testado: Disparos (precisa de canal). Detalhe menor: GET de agente
   apagado responde 200 com `{agent:null}`.
3. WhatsApp por QR com o número do dono: FEITO, PR #10 no ar. Recebe, a IA
   responde, resposta humana pela Caixa de entrada sai. Worker do Render
   religado em 23/10 com o código novo; o passo a passo e as armadilhas
   (certificado do Supabase, URL, ping, deploy automático) estão em
   `worker/README.md`. Falta: automação mandando WhatsApp por QR e um disparo.
4. "Aprovação" de modelos (templates) para a API NÃO oficial (QR), ao lado dos
   modelos aprovados pela Meta (API oficial); deixar claro como cada uma dispara.
5. Ações de canal nas automações: WhatsApp, Instagram, Telegram e outros.
6. Depois: rever a tela de login (propostas em
   docs/design/proposta-v6/login-cesar/v2, branch feat/login-v2-propostas; a
   foto de referência não tem licença: trocar por foto livre antes de produção).

## >>> COMECE AQUI: status em 22/10/2026, noite (2ª sessão) <<<

Feito e conferido no navegador (1440×900, claro e escuro), commit local no PR #8:
- Bugs 1 e 2 conferidos: nós aparecem nas automações; abrir/sair do editor
  não faz PATCH (aba Network).
- Revisão tela a tela (claro e escuro) feita. Corrigido: topo do Início ficava
  claro no tema escuro (`.heroi-escuro` em globals.css); orbes dos agentes no
  Início, na lista de agentes (grade de cartões ≥1280px) e na Caixa de entrada;
  Biblioteca em 2 colunas; Aprovações vazio em cartão; colunas de Negócios até
  embaixo; minimapa da automação sem a moldura cinza.
- Builder de agentes no visual do fluxograma novo (nós quadrados, fios com
  brilho, barra flutuante, minimapa discreto). Fluxos antigos guardam as
  posições dos cartões grandes: ficam espaçados até alguém clicar "Organizar
  os blocos" (grava no banco; não foi clicado).
- Troca de tema com círculo que nasce do botão (`trocarTema` em
  `components/ui/theme.tsx`, View Transitions), medida contra o vídeo
  `lumen-toggle.mp4` e gravada no app: ~0,45 s, tema novo entra pronto.
- Ferramentas de movimento instaladas (só local, `.claude/` não vai pro git):
  skills `animation-reverse-engineering` e `web-motion` em `.claude/skills/`,
  ffmpeg (winget). Gravar o app logado:
  `.claude/skills/web-motion/scripts/record-app.mjs` (login uma vez numa
  janela do Edge, `EVA_PW_CANAL=msedge`; o Chromium baixado é bloqueado
  neste Windows).
- Dashboard: o "Ver mais N cartões" foi mantido (decisão da v5).

**Atualização (22/10, mais tarde):**
- Login escolhido: proposta 2 "Constelação" (César em nuvem de pontos), num
  cartão escuro sobre o fundo "gelo" (cordilheira em linhas finas). Feito em
  `src/app/(auth)/layout.tsx`, `components/entrada/fundo-gelo.tsx` e
  `components/entrada/busto-constelacao.tsx` (foto em `public/entrada/`).
- Regra nova do dono: sempre o LOGO OFICIAL de marcas (WhatsApp, Instagram,
  Google, Google Agenda…), nunca ícone genérico (ex.: balão verde no lugar do
  WhatsApp). Usar `src/components/ui/logo-oficial.tsx` (`<LogoOficial
  marca="whatsapp" />`, SVGs da coleção Iconify "logos", CC0).
- Login novo com Júlio César: 5 propostas animadas em
  `docs/design/proposta-v6/login-cesar/` (abrir `index.html` por HTTP:
  preview "propostas-v6" na porta 8110). Base: foto do busto de Túsculo,
  domínio público. A 2 foi a escolhida.
- Google Agenda: proposta com logos oficiais; integração ainda depende das
  respostas (só leitura?, quem vê, app OAuth, tabela nova).

Próximo: respostas do Google Agenda,
depois aplicar o mesmo método (medir vídeo, gravar, comparar) nas
transições de painel/gaveta/modal (ref. Cadra: fundo desfocado atrás).

## Status anterior (22/10, fim do dia)

Feito na sessão de 22/10 (noite), tudo no PR #8, branch `feat/redesign-visual`:
- Tema separado do canvas: editor de automação respeita "canvas sempre
  escuro" (conferido no navegador).
- Negócios fixo em "Eva · 3" (seletor de estilo removido). Conferido em v5.
- Largura no desktop: Insights, Integrações (e API), Aprovações sem coluna
  centralizada; páginas de contato e de empresa em 2 colunas no ≥1280px
  (dados à direita); página do agente em 2 colunas com o painel da orbe.
- Animações: toque com mola em todo botão/aba (globals.css, fim do arquivo);
  View Transitions ligada (`experimental.viewTransition` em next.config.ts +
  `<ViewTransition>` no layout do contrato): a tela antiga sai com desfoque.
  NÃO conferido visualmente ainda.
- Calendário: aba "Calendário" em Tarefas (`components/tarefas/calendario*.ts*`),
  conferido no navegador. Itens vêm como `EventoDoCalendario` com `origem`
  ("tarefa" | "agenda") — pronto para receber Google Agenda depois. Limite:
  `/api/tasks` traz no máx. 300 e não filtra por data.
- Tarefas: tela em largura total + coluna à direita (`coluna-do-dia.tsx`)
  no ≥1280px.
- Orbe por agente: `components/agent-studio/orbe-do-agente.tsx`,
  `cor-do-agente.ts` (cor no localStorage `eva.agente.cor.<id>`),
  `cor-da-orbe.tsx` (paleta + RGB). Na lista, página do agente, builder e
  Playground (coluna lateral `playground/painel-do-agente.tsx`). Conferido.
- Fluxograma novo de automações (`components/automacoes/canvas.tsx`,
  `seletor.tsx`, `automacoes/[id]/page.tsx`, `lib/automacoes/layout.ts`):
  nós quadrados com ícone, fios com brilho, painel "O que vem depois?", barra
  flutuante.

**BUGS (corrigidos no fim de 22/10, conferir):**
1. Fluxograma vazio: nós agora declaram tamanho fixo (88×88 / 56×56) em
   `canvas.tsx`, sem depender da medição do React Flow. O subagente viu os nós
   aparecendo; conferir de novo.
2. "salvando…" ao abrir: era real (PATCH ao abrir/remontar). `automacoes/[id]/page.tsx`
   agora só salva quando o rascunho difere do que veio do servidor. Conferir
   que abrir e sair do editor não faz nenhum PATCH (aba Network).
3. Conferir no navegador: View Transitions + toque com mola, páginas de
   contato/empresa/agente em 2 colunas, Playground com coluna, tudo no claro e
   no escuro, em 1440–1920px.

**DEPOIS (ainda não feito):** visual do fluxograma também no builder de
agentes; orbe dos agentes na Caixa de entrada; fundo "gelo" (ref. 05, mostrar
proposta antes); integração Google Agenda (conversar antes: OAuth, banco);
decidir gravar a cor da orbe no banco (hoje só navegador); revisão completa
tela a tela; merge do PR #8 só com ok do dono (main = produção).


Escrito em 22/10/2026, no fim da sessão que aplicou a v5 no app inteiro.
Quem pegar isto: leia este arquivo inteiro antes de mexer em código. Ele traz
o pedido do dono do produto, o estado do código e o passo a passo.

## 0. Como trabalhar aqui (regras que não mudam)

- Repositório: `matheusflytech/eva-studio`. Worktree usada até agora:
  `D:\Skeps\repos\eva-studio-redesign`, branch `feat/redesign-visual`, PR
  https://github.com/matheusflytech/eva-studio/pull/8 (aberto, não mergeado).
  A `main` faz deploy em produção (evapp.vercel.app) a cada merge.
- Sempre via PR, nunca push direto na `main`. Merge só com o ok explícito do
  dono. Commits com o autor git configurado (Matheus Paes,
  matheusflytech@gmail.com).
- Next.js 16 + React 19 + Tailwind v4. Leia `AGENTS.md`: a versão do Next tem
  mudanças; consulte `node_modules/next/dist/docs/` antes de usar API nova.
- Banco = Supabase de PRODUÇÃO (o `.env.local` aponta para ele). Nada de dado
  de teste sem apagar depois.
- Não mude API, banco nem regra de negócio sem perguntar. Não acrescente
  recurso/tela/camada que não foi pedido sem perguntar.
- Textos em português do Brasil.
- Ao terminar cada bloco: `npx tsc --noEmit`, `npx vitest run` (1825 testes
  hoje) e `graphify update .` (pasta `graphify-out/` está no gitignore).
- Dev server: `npm run dev -- -p 3100` (no app do Claude: preview "eva-redesign"
  em `D:\Skeps\.claude\launch.json`). O login é do usuário: peça para ele
  entrar no painel do navegador; não digite senha.
- **Foco agora: só desktop.** O dono pediu para esquecer o celular por enquanto.
- Windows desta máquina está com "Efeitos de animação" desligado, então o
  navegador reporta `prefers-reduced-motion: reduce`. O app trata isso como
  "movimento mais calmo" (não parado). Para ver o movimento completo, ligue em
  Configurações › Acessibilidade › Efeitos visuais.

## 1. Onde estão as referências

- `docs/design/redesign-2026-10.md`: pesquisa e decisões da v1–v5.
- `docs/design/proposta-v5/`: mockups HTML aprovados da v5 (`telas/*.html`,
  `kit.css`, `fundo.js`) e as regras dadas aos agentes (`APLICAR-v5*.md`).
- `docs/design/referencias-v6/` (novas, deste pedido):
  - `01-bug-automacao-e-menu.png`: editor de automação atual + menu da conta.
  - `02-calendario.png`: calendário mensal em grade de cartões arredondados,
    dias com dado viram cartão colorido com valor e contagem (base para o
    Calendário do CRM: tarefas/reuniões/negócios por dia).
  - `03-fluxograma-automacao.png`: fluxo estilo "quarn": nós escuros quadrados
    com ícone grande, rótulo abaixo, fios curvos que brilham, rótulos nos fios
    ("1 item", "Tool"), painel "What happens next?" à direita com busca e
    categorias (IA, Ação em app, Transformação de dados, Fluxo, Core, Humano no
    loop), barra inferior flutuante (Testar fluxo, zoom, desfazer). Fazer com o
    tema da Eva (sem verde neon: o acento é o azul #1f6fd6, brilho sutil).
  - `04-orbe-de-agente.png`: esfera escura de "espinhos"/partículas que
    deforma. É o nível de qualidade da orbe de cada agente.
  - `05-fundo-montanha-gelo.webp`: app escuro flutuando sobre fundo de
    montanha cor de gelo, bem clean (AwSales). Referência de "algo de fundo".
  - `cadra.mp4`, `tavola.mp4`, `lumen-toggle.mp4`: referência de QUALIDADE de
    animação (nível Apple, luxo). Assista antes de mexer em movimento.
  - O dono vai mandar mais vídeos e um link do Pinterest (orbe por agente).
    ElevenLabs foi citado como referência de orbe "viva".

## 2. Estado atual (o que já está no PR #8)

Tudo em v5: tokens (claro #f5f5f7 / escuro fosco #0a0a0b, acento #1f6fd6),
fundo vivo (curvas de nível em canvas, `src/components/layout/fundo-vivo.tsx`
+ `src/lib/fundo/*`), ilha dinâmica (`layout/ilha.tsx`, eventos
`pulsar()`/`avisarNaIlha()` em `src/lib/fundo/eventos.ts`), orbe da Eva
(`layout/orbe-eva.tsx`), logo vetorial (`layout/marca-eva.tsx`), login de
vidro, menu lateral, e todas as telas (Início, Caixa de entrada, Contatos,
Negócios, Leads, Tarefas, Dashboard, Insights, Empresas, Aprovações, Ajuda,
Começar, Agentes de IA, Playground, Automações, Sequências, Disparos,
Biblioteca, Configurações, Integrações, escolher contrato, Painel da Eva).
Movimento: troca de tela em cascata (`.entrada-de-tela` em globals.css), pílula
do menu e polegar do segmentado com framer `layoutId`, ilha com mola, menus e
modais com mola.

Corrigido nesta última passada (ainda não verificado no navegador):
- Editor de automação ignorava "canvas sempre escuro" nos cartões: o
  contêiner agora recebe `data-theme={tema}` (`components/automacoes/canvas.tsx`).
  Conferir também o builder de agentes (`agent-studio/[agentId]/builder/page.tsx`
  já aplica `data-theme` no canvas; checar painéis laterais).
- Negócios fixo no estilo "Eva · 3": o seletor "Estilo da tela" saiu do "…"
  (`negocios/page.tsx`). Restos a limpar: `EstiloDaTela`, `SeletorDeEstilo`
  (`crm/negocios/eva-topo.tsx`), ramos `estilo === "classico" | "v1" | "v2"`,
  imports que sobraram (usePreferencia, DropdownMenuCheckboxItem/Label).

## 3. Pedido do dono (22/10, noite) — o que fazer, em ordem

### 3.1 Bugs e revisão de verdade (primeiro)
1. **Negócios "continua o antigo"**: provável causa = preferência antiga
   "Atual"/"classico" guardada no navegador (`eva:negocios:estilo`). Já fixado
   em v3; confirmar no navegador que quadro, cartões, colunas, página do
   negócio e prévia estão no visual v5. Revisar Negócios inteiro (quadro,
   lista, página do negócio, prévia, configurar funil, relatório).
2. **Tema do canvas separado**: com "app claro + canvas escuro" o builder e o
   editor de automação devem ficar escuros e o resto claro. Testar nos dois
   (automações e builder de agentes), incluindo nós, fios, minimapa, controles,
   painéis do canvas.
3. **Telas com espaço vazio (desktop)**: Tarefas, Insights, Integrações e
   Playground estão "centralizadas", com faixa vazia à direita ou embaixo. Fazer
   o conteúdo ocupar a largura (sem `max-w-*` + `mx-auto` sobrando; usar
   colunas: lista + painel lateral, ou grade de 2–3 colunas). Revisar todas as
   telas no desktop largo (1440–1920px) procurando o mesmo problema.
4. **Animações fluidas ao clicar**: hoje o clique não "sente" fluido. Ver os
   vídeos de referência. Mínimo: feedback de toque em todo item clicável
   (escala/realce com mola), transições de painel/gaveta/aba com mola e
   continuidade espacial (o que abre nasce de onde foi clicado, layoutId/shared
   element), troca de conteúdo com crossfade+blur curto, listas com entrada em
   cascata, números que contam. Considerar a View Transitions API do Next/React
   (skill `vercel-react-view-transitions`) para transição entre rotas.
   Sem `transition: all`; só transform/opacity/filter.
5. Revisão completa tela a tela no desktop, claro e escuro, antes de declarar
   pronto (a última revisão foi incompleta: o dono reclamou disso).

### 3.2 Recursos novos pedidos
6. **Calendário** (ref. `02-calendario.png`): visão mensal do CRM (tarefas,
   reuniões, próximos passos, fechamentos previstos). Perguntar ao dono onde
   entra (tela própria no menu ou visão dentro de Tarefas) e quais dados
   mostrar, antes de construir. Usar só dados que já existem nas APIs.
   **Integração de agenda (pedido 22/10):** espelhar dentro do calendário a
   agenda da pessoa (Google Agenda, Outlook), "de forma bonita, bem
   profissional, luxo". Recurso novo: precisa OAuth Google, tabela de
   conexões/eventos e sincronização; conversar com o dono antes (escopo,
   leitura só ou também criar evento, privacidade). O componente do
   calendário já recebe uma lista genérica de eventos com `origem`, para a
   agenda externa entrar como outra fonte. Skill útil: crm-tasks-agenda.
7. **Fluxograma de automações novo** (ref. `03-fluxograma-automacao.png`): o
   editor atual (`components/automacoes/canvas.tsx`, layout em
   `src/lib/automacoes/layout.ts`) ainda é o de antes. Refazer o visual no
   estilo da referência com o tema da Eva: nós quadrados escuros com ícone,
   fios curvos com brilho no caminho ativo, rótulo no fio, painel "O que vem
   depois?" com busca e categorias à direita, barra flutuante embaixo. Manter
   toda a lógica (regras, validação, teste, publicar). Avaliar o mesmo visual
   para o builder de agentes (`components/agent-studio/builder/*`).
8. **Orbe por agente**: cada agente de IA tem a sua orbe animada (a mesma
   família da orbe do Início, `layout/orbe-eva.tsx`, nível da ref.
   `04-orbe-de-agente.png`). Cor personalizável por agente: paleta pré-definida
   + seletor RGB livre. Aparece na lista de agentes, na página do agente, no
   builder e onde o agente fala (caixa de entrada, playground). Guardar a cor
   exige campo no agente: PERGUNTAR antes de mexer no banco (pode começar
   derivando a cor do id, como hoje faz `QuadradoDoAgente`). Performance: muitas
   orbes na lista = usar uma versão leve (menos partículas, pausa fora da tela).
9. **Fundo "gelo" clean** (ref. `05-fundo-montanha-gelo.webp`): fundo bem claro
   cor de gelo com relevo de montanha atrás do app, como na AwSales. Propor
   onde usar (login/escolher contrato? casca do app no claro?) e mostrar antes.
   Pode virar uma variação do fundo vivo (curvas de nível já são "relevo").
10. **Um estilo só**: já fixado em "Eva · 3" em Negócios. Remover qualquer
    outro seletor de variação de estilo que sobrar no app.

### 3.3 Ordem sugerida
1 → 2 → 3 → 5 (revisão) e subir no PR #8; depois 4 (movimento), 7
(fluxograma), 8 (orbe por agente), 6 (calendário, depois da conversa), 9
(fundo, depois de mostrar). Mostrar proposta visual (mockup ou print) antes
dos itens 6–9.

## 4. Pendências antigas que continuam valendo

- Link novo em Aprovações para o Gerenciador da Meta
  (`business.facebook.com/wa/manage/message-templates/?waba_id=…`): confirmar
  com o dono que abre os templates antes de produção.
- Empresas filtra só sobre até 200 resultados da busca (API só aceita `q`).
- Sequências sem "responderam"; Disparos sem "entregues/lidas" (API não dá).
- Blocos de IA do builder ainda violeta (`builder/block-styles.ts`): decidir.
- `starburst.tsx` e `negocios/resumo.tsx` sem uso.
- Avisos do eslint `react-hooks/set-state-in-effect` em efeitos de carga antigos.
- Auto-fix do PR #8: o dono não respondeu.
