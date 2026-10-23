# Quadro de negócios v4: plano de implementação

> **Para quem executa:** seguir tarefa por tarefa (superpowers:executing-plans).
> Lógica pura com TDD (teste falhando, código, teste passando, commit). Tela
> verificada no navegador local.

**Objetivo:** card no estilo do exemplo 1, painel lateral no estilo do
exemplo 2, animações com GSAP e personalização de card e painel por pessoa,
sem perder nada do quadro atual.

**Arquitetura:**
- **No lugar:**
  - `stage-column.tsx`, `deal-card.tsx` e `previa.tsx` ganham o visual novo;
  - a página do quadro troca as zonas por colunas;
  - as animações ficam em hooks próprios (`src/components/crm/negocios/animacao/`).
- **Layout:** passa de "do funil" para "resolvido para a pessoa" (pessoa > funil > código) em `src/lib/cartao-layout.ts` (puro) e em `src/lib/server/layout-do-cartao.ts` (leitura).

**Stack:** Next.js 16, React 19, Tailwind v4, dnd-kit 6, GSAP 3 (`gsap`, `@gsap/react`, plugin `Flip`), Prisma 7, Vitest.

Spec: `docs/superpowers/specs/2026-10-23-quadro-de-negocios-v4-design.md`.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `prisma/sql/2026-10-27-layout-da-pessoa.sql` (novo) + `schema.prisma` | tabela `eva_studio_user_card_layouts` |
| `src/lib/cartao-layout.ts` (+ test) | `acoes`, `secoes`, campos `etapa`/`ultimaInteracao`, padrão novo, `resolverLayout(pessoa, funil)` |
| `src/lib/server/layout-do-cartao.ts` (+ test) | `lerLayoutDoFunil(pipelineId, defs, userId?)` devolve também o da pessoa |
| `src/app/api/pipelines/[id]/cartao/meu/route.ts` (novo, + test) | GET/PUT/DELETE do layout da pessoa |
| `src/app/api/deals/route.ts` | passa `ctx.userId` |
| `src/components/crm/negocios/cartao.ts` (+ test) | `topoDoCartao(deal, campos)`, `acoesDisponiveis(deal, acoes)`, texto de `etapa`/`ultimaInteracao` |
| `src/components/crm/negocios/deal-card.tsx` | card do exemplo 1 |
| `src/components/crm/negocios/stage-column.tsx` | cabeçalho sem ponto, botão "+ Adicionar negócio", coluna de fundo sutil |
| `src/components/crm/negocios/previa.tsx` | painel do exemplo 2, por seções |
| `src/components/crm/negocios/personalizar.tsx` (novo) | gaveta "Personalizar card/painel" |
| `src/components/crm/config/cartao-editor.tsx` | ações e seções no padrão do funil |
| `src/components/crm/negocios/animacao/*.ts(x)` (novo) | `useEntradaDoQuadro`, `useInclinacaoNoArrasto`, `useFlipDoQuadro`, `NumeroAnimado`, `useAberturaDoPainel` |
| `src/app/(app)/[contrato]/negocios/page.tsx` | sem zonas; liga animações, painel e personalização |
| `zonas-de-fechamento.tsx` | removido |

---

### Tarefa 0: dependência
- [ ] `npm i gsap @gsap/react`. Conferir que o `next build` aceita.
- [ ] Ler o skill `gsap-react` antes das tarefas de animação.

### Tarefa 1: layout com ações e seções (puro, TDD)
- [ ] Testes em `src/lib/cartao-layout.test.ts`:
  - layout salvo antigo (sem `acoes`/`secoes`) normaliza com o padrão delas;
  - valores desconhecidos saem;
  - `secoes` vazia vira `["detalhes"]` (o painel nunca fica vazio);
  - `erroDoLayout` aceita os campos novos e recusa valores inválidos;
  - `resolverLayout(pessoa, funil)` é a pessoa quando existe e o funil quando não.
  - O padrão novo é `campos: contato, valor, previsao, responsavel` e `previa: empresa, valor, etapa, previsao, responsavel, ultimaInteracao, criadoEm`.
- [ ] Implementar:
  - `ACOES_DO_CARTAO`, `SECOES_DO_PAINEL`, `CAMPOS_PADRAO.etapa` ("Etapa") e `CAMPOS_PADRAO.ultimaInteracao` ("Última interação");
  - `LAYOUT_PADRAO` novo;
  - normalização e validação das duas listas.
- [ ] Ajustar os testes antigos que dependiam do padrão anterior: `cartao.test.ts`, `route.quadro.test.ts` e os do editor.
- [ ] Commit.

### Tarefa 2: tabela e leitura do layout da pessoa
- [ ] SQL: tabela, índice único (`userId`, `pipelineId`), índice `orgId`, RLS, numa transação. Model `UserCardLayout`. `npx prisma generate`.
- [ ] `lerLayoutDoFunil(pipelineId, defs, userId?)`:
  - devolve `{ layout (resolvido), doFunil, proprio: boolean, disponivelPessoal, ... }`;
  - sem a tabela, `disponivelPessoal: false` e vale o layout do funil.
  - Testes com prisma mockado.
- [ ] `GET /api/deals` passa `ctx.userId`. Ajustar `route.quadro.test.ts`.
- [ ] Commit.

### Tarefa 3: rota `cartao/meu`
- [ ] Teste primeiro:
  - GET exige `read` e o funil da org;
  - PUT valida (`erroDoLayout`) e faz upsert por (`userId`, `pipelineId`) com o `orgId` do contexto;
  - DELETE apaga só o da pessoa;
  - sem a tabela, PUT devolve 503 com mensagem.
- [ ] Implementar. Commit.

### Tarefa 4: funções puras do card (TDD)
- [ ] `topoDoCartao(deal, campos)`:
  - com contato e `contato` no layout: `{ foto: nome do contato, titulo: contato, subtitulo: nome do negócio (ou empresa quando o nome não está nos campos) }`;
  - sem contato: `{ foto: empresa ou negócio, titulo: nome do negócio, subtitulo: empresa }`.
- [ ] `acoesDisponiveis(deal, acoes)`:
  - WhatsApp só com conversa;
  - Ligar só com telefone;
  - Tarefa e Nota sempre.
- [ ] `textoDoCampo` para `etapa` (nome da etapa do contexto) e `ultimaInteracao` (relativo de `lastActivityAt`).
- [ ] Commit.

### Tarefa 5: coluna e card (visual)
- [ ] `stage-column.tsx`:
  - o cabeçalho perde o ponto colorido e a linha da porcentagem;
  - o contador vira selo, e o total em R$ vai à direita;
  - entra o botão "+ Adicionar negócio" (contorno de destaque, `onNovo`);
  - a coluna ganha `bg-raised` e `rounded-[18px]`;
  - o realce de `isOver` fica suave, com anel e fundo de destaque a 6%.
- [ ] `deal-card.tsx`:
  - estrutura do exemplo 1 (topo com `Avatar` e "⋯", pares de rótulo e valor, rodapé com `AcoesDoCartao` e sinal);
  - sem `border-l-warning`;
  - o hover vira `translateY(-2px)` e sombra (CSS).
  - O "⋯" tem Abrir ficha e Mover para… (as etapas, pelo `mudanca.mover`).
- [ ] Ações do rodapé:
  - WhatsApp: link para a conversa;
  - Ligar: `tel:` do telefone do contato;
  - Tarefa: abre o painel já na criação de tarefa;
  - Nota: abre o painel na nota.
  - Todas com `pararArraste`.
- [ ] Remover `zonas-de-fechamento.tsx` e o uso dele em `page.tsx`.
- [ ] Commit.

### Tarefa 6: painel
- [ ] `previa.tsx` vira o painel por seções (`layout.secoes`):
  - **Detalhes:** `layout.previa`, com ícone por campo. Etapa é um seletor que move pelo `onMover`, e Ganho/Perdido são botões para negócio aberto.
  - **Contato principal:** o primeiro de `deal.contacts`, buscando cargo e foto pelo `GET /api/deals/[id]`, que já devolve os contatos.
  - **Atividade:** `GET /api/deals/[id]/linha-do-tempo` mais `LinhaDoTempoView` e `NovaNota`.
  - **Tarefas:** as tarefas abertas do `GET /api/deals/[id]`, com `useConcluirTarefa`.
  - **Produtos:** os itens do negócio.
- [ ] Topo com ⤢ (link para a ficha), "⋯" (Personalizar painel) e fechar. Manter Esc, clique fora e devolução do foco.
- [ ] Commit.

### Tarefa 7: personalizar
- [ ] `personalizar.tsx`:
  - gaveta (`Drawer`) com abas Card e Painel;
  - usa `lista-ordenavel.tsx` (liga/desliga e ordem) e a prévia ao vivo com `DealCard` e `negocioDeExemplo`;
  - salva no `PUT cartao/meu`;
  - "Voltar ao padrão do funil" chama o DELETE;
  - sem tabela, mostra um aviso e deixa só ler.
- [ ] Entradas: "⋯" da barra do quadro (Personalizar card) e "⋯" do painel (Personalizar painel).
- [ ] `cartao-editor.tsx` (padrão do funil) ganha as listas de ações e seções.
- [ ] Commit.

### Tarefa 8: animações
Tudo dentro de `gsap.matchMedia`; com reduzir movimento, só opacidade.
- [ ] `useEntradaDoQuadro(ref, chaveDoFunil)`: `gsap.from("[data-deal-id]", { y: 8, autoAlpha: 0, stagger: 0.03, duration: 0.35 })`, só na primeira carga de cada funil.
- [ ] `useInclinacaoNoArrasto(ref, ativo)`:
  - `quickTo` em `rotation` e `scale`;
  - lê a velocidade do `pointermove` e solta para 0 com o ponteiro parado (timer de 120 ms).
  - Aplica no wrapper interno do `DragOverlay`, nunca no nó que o dnd-kit posiciona.
- [ ] `useFlipDoQuadro(ref)`:
  - `Flip.getState("[data-deal-id]")` antes de `setStages` mudar as colunas;
  - `Flip.from` depois da pintura (`useLayoutEffect` na troca de `stages`), com `duration: 0.45`, `ease: power3.out` e `absolute: true`, só para os cards que mudaram de lugar.
  - No soltar do arrasto, parte da posição do overlay.
- [ ] `NumeroAnimado`: interpola contagem e R$ com `gsap.to` num objeto, formatando a cada quadro.
- [ ] `useAberturaDoPainel(painel, origem)`:
  - `Flip.fit` do retângulo do card até o painel, mais entrada em sequência das seções;
  - na troca de negócio, cruza o conteúdo;
  - no fechar, `x: 24, autoAlpha: 0` em 200 ms.
- [ ] Commit.

### Tarefa 9: verificação
- [ ] `npx vitest run`, `npx tsc --noEmit`, eslint nos arquivos tocados (sem erro novo) e `npx next build`.
- [ ] SQL da tabela da pessoa aplicado com o OK do Matheus/Alfredo.
- [ ] Navegador local com "[TESTE CLAUDE]":
  - **Arrasto:** entre colunas, para Ganho e Perdido, e de Ganho para Perdido. Conferir que a coluna não estica durante o arrasto.
  - **Painel:** abrir e trocar de negócio.
  - **Personalização:** personalizar e voltar ao padrão.
  - **Ambientes:** reduzir movimento, largura de celular, tema escuro.
  - Apagar os dados de teste no fim.
- [ ] PR com prints e o SQL para aplicar.
