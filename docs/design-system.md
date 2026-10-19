# Design system do Eva Studio

Página viva: **/design-system** (dentro do app, com login). Tokens em
`src/app/globals.css`, espelho em TS em `src/lib/design-system/tokens.ts`,
componentes em `src/components/ui`.

Direção: **Minimalism & Swiss Style** (recomendação da skill ui-ux-pro-max para
CRM SaaS), densidade alta, movimento mínimo, sem decoração. Referência: CRM de
mercado denso e limpo — tela preenchida, tabela larga, filtros em linha como
texto, cor quase só em status.

## Princípios

1. **Dado primeiro.** A tela existe para mostrar registros. Tabela larga e cheia,
   linhas de 40px, nada de cartão gigante com três números.
2. **Hierarquia por tipografia e espaçamento**, não por cor, borda colorida ou
   brilho. Título maior e mais pesado; secundário em `text-text-secondary`.
3. **Uma cor de marca.** O azul do acento aparece no botão primário, no link, no
   item selecionado e no foco. Mais nada.
4. **Cor de status só em status** (sucesso, aviso, perigo, info): texto, ícone e
   fundo sutil de badge. Nunca em borda de cartão, nunca em fundo de seção.
5. **Bordas finas e neutras** separam; sombra só em overlay (menu, modal,
   gaveta, toast).
6. **Dois temas de verdade.** Todo componente usa token semântico; nenhum hex.
7. **Acessível por padrão.** AA nos dois temas (testado), foco visível,
   teclado, `aria-*` certos, movimento desligado com "reduzir movimento".

## Tema

- Atributo `data-theme="light" | "dark"` no `<html>`.
- Preferência: `system` (padrão), `light` ou `dark`. Salva em `localStorage`
  (`eva-theme`) **e** cookie `eva-theme` (1 ano), para o servidor poder ler um dia.
- Sem piscar: `THEME_INIT_SCRIPT` (`src/lib/design-system/theme.ts`) roda no
  `<head>` do `src/app/layout.tsx` antes da primeira pintura, como manda
  `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
  O `<html>` tem `suppressHydrationWarning`.
- No cliente: `useTheme()`, `setThemePreference()` e `<ThemeToggle />` em
  `src/components/ui/theme.tsx`. `<ThemeSync />` (em `providers.tsx`) acompanha a
  troca de tema do sistema quando a preferência é `system`.
- `data-theme` funciona em qualquer elemento: `<aside data-theme="dark">` deixa
  só aquele trecho escuro (é assim que o menu lateral fica escuro no tema claro).
- Impressão é sempre clara (`@media print` no globals.css).

## Tokens

Os componentes usam **só** os nomes semânticos. A escala crua (`--gray-*`,
`--blue-*`) existe para referência e não é usada em componente.

### Cores (classe Tailwind → variável)

| Grupo | Classes | Uso |
|---|---|---|
| Superfície | `bg-page`, `bg-panel`, `bg-raised`, `bg-hover`, `bg-overlay` | fundo do app; cartão/tabela; faixa sutil (cabeçalho de tabela, coluna do quadro); hover/ativo; menu/modal |
| Borda | `border-border-subtle`, `border-border-default`, `border-border-strong` | divisória; moldura de campo/overlay; hover de campo |
| Texto | `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `text-text-disabled`, `text-text-on-accent` | conteúdo; apoio; metadado/placeholder; desabilitado; texto sobre acento |
| Acento | `bg-accent-solid`, `hover:bg-accent-solid-hover`, `text-accent-fg`, `bg-accent-subtle` | botão primário; link e ação em texto; linha/visão selecionada |
| Status | `text-success` / `bg-success-subtle`, `text-warning` / `bg-warning-subtle`, `text-danger` / `bg-danger-subtle` / `bg-danger-solid`, `text-info` / `bg-info-subtle` | só badge, ícone e texto de status |
| Foco / inverso | `outline-focus`, `bg-inverse`, `text-inverse-fg`, `bg-backdrop` | anel de foco; tooltip; véu do modal |

Valores (claro / escuro):

| Token | Claro | Escuro |
|---|---|---|
| surface-page | #fafafa | #0e0e10 |
| surface-panel | #ffffff | #151518 |
| surface-raised | #f4f4f5 | #1c1c20 |
| surface-hover | #ebebee | #26262b |
| surface-overlay | #ffffff | #1c1c20 |
| border-subtle / default / strong | #ececef / #dcdce1 / #c4c4cc | #222227 / #2e2e34 / #3d3d45 |
| text-primary / secondary / tertiary | #18181b / #52525b / #63636d | #ececef / #a6a6b0 / #91919b |
| text-disabled | #a1a1aa | #55555e |
| accent-solid / hover | #2f5fd3 / #264fb3 | #3b67cc / #3359b3 |
| accent-fg / subtle | #2a56c4 / #edf2fd | #8cb0f7 / #17213a |
| success fg / subtle | #17734a / #e7f5ee | #4cc38a / #11261b |
| warning fg / subtle | #935a00 / #fcf2df | #e3a547 / #2a2010 |
| danger fg / subtle / solid | #c22f2f / #fdeded / #c22f2f | #f07575 / #2d1617 / #c43b3b |
| info fg / subtle | #1f66a8 / #e8f1fa | #6cb1ef / #122338 |
| focus-ring | #2f5fd3 | #8cb0f7 |

### Contraste (WCAG 2.x, calculado e testado)

Todos os pares de `CONTRAST_PAIRS` passam nos dois temas (teste em
`src/lib/design-system/design-system.test.ts`). Piores casos:

| Par | Claro | Escuro |
|---|---|---|
| text-tertiary sobre surface-hover | 4,99 | 4,82 |
| text-tertiary sobre surface-panel | 5,93 | 5,83 |
| text-secondary sobre surface-panel | 7,72 | 7,55 |
| texto branco sobre accent-solid | 5,67 | 5,25 |
| danger-fg sobre danger-subtle | 4,94 | 6,05 |
| focus-ring sobre surface-page (mín. 3) | 5,44 | 8,87 |

A tabela completa está na página viva (seção Contraste).

Exceção consciente: bordas de separação e de campo ficam entre 1,15 e 1,4:1
(padrão de CRM de mercado). Campo é identificado pelo rótulo visível e o foco
tem anel de 2px com contraste ≥ 5:1.

### Tipografia

**Uma família: Inter** (variável, via `next/font`, todos os pesos num arquivo).
Plus Jakarta Sans saiu: duas famílias geométricas parecidas não criam
hierarquia, só ruído, e a Jakarta é larga demais para tabela densa. A Inter foi
desenhada para tela em 12–14px e tem algarismos tabulares
(`tabular-nums`), essenciais em coluna de valor. `font-display` continua
existindo e aponta para a Inter (compatibilidade). JetBrains Mono fica para
código.

| Classe | Tamanho/altura | Peso | Uso |
|---|---|---|---|
| `text-caption` | 12/16 | 400 | metadado, rodapé de coluna, contagem |
| `text-small` | 13/18 | 400 | célula de tabela, filtro, item de menu |
| `text-body` | 14/20 | 400 | texto padrão (é o do `body`) |
| `text-body-lg` | 16/24 | 400 | texto corrido |
| `text-title-sm` | 18/26 | 600 | título de modal/gaveta/seção |
| `text-title` | 20/28 | 600 | título de painel grande |
| `text-heading` | 24/32 | 600 | título de página |
| `text-display` | 30/38 | 600 | número de destaque |

Peso: 400 texto, 500 rótulo/ênfase, 600 título. Nada de 700/800.
Números em tabela, Stat e totais: `tabular-nums`.

### Espaçamento, raios, sombra, movimento

- **Espaçamento base 4** (escala do Tailwind: `p-1` = 4px). Ritmo comum: 4, 8,
  12, 16, 24. Página: `px-6 py-6`; painel: `p-4`; célula: `px-3`.
- **Raios**: `rounded-sm` 4px (badge, checkbox), `rounded-md` 6px (botão,
  campo, item de menu), `rounded-lg` 8px (painel, tabela, cartão),
  `rounded-xl` 12px **só overlay** (modal). `rounded-2xl`/`3xl` foram achatados
  para 8/12px no tema, para as telas antigas já entrarem no padrão.
- **Sombra**: só `shadow-overlay` (menu, modal, gaveta, toast).
- **Movimento**: 120ms (hover/cor), 160ms (menu, tooltip, switch), 200ms
  (modal, gaveta, toast), curva `ease-standard`. Com
  `prefers-reduced-motion: reduce`, tudo é desligado no globals.css.

## Componentes (`src/components/ui`)

| Componente | Quando usar |
|---|---|
| `Button` | Ação. `primary` (um por área), `secondary`, `ghost` (ação de baixo peso, barra), `danger` (destrutiva, confirmada em Modal). `sm` 28px em barra/tabela, `md` 32px padrão. `loading` bloqueia e mostra progresso. `solid` = `primary` (nome antigo). |
| `IconButton` | Ação só com ícone. `aria-label` obrigatório no tipo; `tooltip` repete o rótulo. |
| `Input`, `Textarea`, `Label`, `Field` | Campo. Use `Field` (rótulo + ajuda + erro ligados por `aria-describedby`, `aria-invalid`). Erro embaixo do campo, em texto. |
| `Select` | Escolha única nativa. Múltipla escolha com busca: `FilterButton`. |
| `Checkbox` | Opção que vale ao salvar; seleção em tabela; `indeterminate` para parcial. |
| `Switch` | Liga/desliga com efeito imediato. |
| `Badge` | Status (neutral, info, success, warning, danger). Não é enfeite de rótulo. |
| `Avatar` | Pessoa. Iniciais em cinza; nunca cor aleatória. |
| `Tabs` | Alternar conteúdo dentro de uma página (sublinhado). |
| `ViewTabs` | Visões salvas de uma lista, com contagem e "+". |
| `Modal` | Decisão curta que bloqueia (confirmar, criar com 2–3 campos). |
| `Drawer` | Detalhe de registro, formulário longo, filtros avançados. |
| `DropdownMenu` | Ações de linha, "Mais", ordenar. `tone="danger"` no item destrutivo. |
| `Tooltip` | Nome de ícone, dica curta. Nunca a única fonte de informação. |
| `Toast` (`useToast`) | Confirmação curta do que já aconteceu. Erro de campo não vai em toast. |
| `EmptyState` | Lista/painel vazio: o que falta + próximo passo. `compact` dentro de tabela. |
| `Card` / `Panel` | Agrupar conteúdo. `Panel` tem cabeçalho com ações e `flush` para tabela. |
| `PageHeader` | Topo da página: título, descrição de uma linha, ações (≤ 1 primário). |
| `Toolbar` | Linha de filtros à esquerda e ações à direita, acima da tabela/quadro. |
| `FilterButton` | Filtro em linha "Proprietário ▾"; contagem quando há seleção; menu de múltipla escolha com busca. |
| `DataTable` | Lista de registros. Cabeçalho fixo (passe `max-h-*`), ordenação com `aria-sort`, seleção com "Selecionar página", números à direita, `loading` e `empty`. Ordem/paginação controladas por fora (servidor). |
| `Pagination` | Abaixo da tabela: itens por página 25/50/100, "1–25 de 24.752", números com reticências. |
| `Stat` | Número + rótulo + variação escrita com seta. `inverse` quando subir é ruim. |
| `KanbanColumn` / `KanbanCard` | Casca do quadro: cabeçalho (nome, contagem, recolher), cartões simples, rodapé Total e Ponderado. Drag-and-drop fica na tela. |
| `Skeleton` | Carregamento no formato do conteúdo final. |
| `ThemeToggle` | Alternar sistema → claro → escuro. |

Lógica pura e testada em `src/lib/design-system`: `pagination.ts` (intervalo,
números, seleção de página, ordenação), `format.ts` (moeda, variação, iniciais,
busca sem acento), `theme.ts`, `contrast.ts`, `tokens.ts`.

## Compatibilidade

Os nomes antigos continuam valendo e apontam para os tokens novos:

| Antigo | Agora |
|---|---|
| `bg-bg-base` | `surface-page` |
| `bg-surface-1` / `-2` / `-3` | `surface-panel` / `-raised` / `-hover` |
| `text-text-*`, `border-border-*` | mesmos nomes, novos valores por tema |
| `bg-accent-500` | `accent-solid` (fundo do botão) |
| `text-accent-400` | `accent-fg` (texto em acento) |
| `accent-600` | `accent-solid-hover` |
| `bg-accent-soft` | `accent-subtle` |
| `text-danger` | `danger-fg` |
| `ice`, `ice-soft`, `ice-border` | par inverso (escuro no claro, claro no escuro) |
| ponte shadcn (`bg-card`, `text-muted-foreground`...) | aponta para os semânticos |
| `.glass-card` | painel com borda fina, **sem blur e sem sombra** |
| `.app-backdrop` | cor de página lisa, sem brilho radial |
| `text-emerald-*/amber-*/rose-*/sky-*` (tons 200–400) | **só no tema claro**, viram os tokens de status (ponte temporária para as telas antigas continuarem legíveis em fundo branco) |

Ponto de atenção: `hover:bg-accent-400` (12 usos antigos em botão) no tema
escuro vira azul claro com texto branco. Trocar por `Button` ou
`hover:bg-accent-solid-hover` ao migrar a tela.

## NÃO FAZER (o que dá "cara de IA")

Exemplos tirados do código atual. Não copie; ao migrar a tela, troque.

1. **Borda colorida em cartão.** `rounded-2xl border border-amber-400/25 bg-amber-400/5`
   (`src/app/(app)/sequencias/assistente-ia.tsx:223`, `src/components/agent-studio/builder/montar-com-ia.tsx:312`; 15 ocorrências de `border-{status}/NN`).
   → Painel neutro + `Badge variant="warning"` ou ícone `text-warning`.
2. **Brilho / gradiente radial.** `radial-gradient(ellipse at top left, rgba(245,247,250,0.12)...)`
   (`src/app/(app)/inicio/page.tsx:81`, `src/components/agent-studio/agent-empty-state.tsx:14`);
   brilho que "respira" (`eva-respira` em `src/components/crm/negocios/eva-topo.tsx:43`);
   gradiente de três cores (`src/components/agent-studio/builder/conversation-mode.tsx:178`).
   → Fundo liso `bg-page`/`bg-panel`.
3. **Vidro.** `glass-card` (99 usos) com `backdrop-blur` e sombra pesada; véu com
   `backdrop-blur-sm` (`src/app/(app)/contatos/page.tsx:697`).
   → `Panel`/`Card`; overlay com `bg-backdrop`, sem blur.
4. **Cantos muito arredondados.** `rounded-2xl`/`rounded-3xl` em tudo (234 usos).
   → 6px controle, 8px painel, 12px só overlay.
5. **Tamanho de texto arbitrário.** `text-[13.5px]`, `text-[12.5px]`, `text-[11.5px]`
   (1.324 usos de `text-[Npx]`; ex.: `src/app/(app)/agent-studio/page.tsx:112`).
   → `text-caption` / `text-small` / `text-body`...
6. **Várias cores de destaque ao mesmo tempo** e **hex solto em componente**:
   `text-[#f2a65a]` (`src/app/(app)/negocios/page.tsx:239`), `#5b8def`, `#10b981`
   (`src/app/(app)/negocios/relatorio/page.tsx:247`), verde WhatsApp; 73 hex em telas.
   → Um acento (`accent-*`) + status. Nenhum hex fora do globals.css.
7. **Pílulas e chips demais.** `rounded-full border px-3 py-1`
   (`src/components/agent-studio/skills-picker.tsx:76`, `src/app/(app)/integracoes/api/referencia/page.tsx:94`).
   → Filtro vira `FilterButton` (texto com seta); status vira `Badge` (4px).
8. **Sombra fora de overlay.** `shadow-2xl` em cartão (`src/app/(app)/leads/page.tsx:909`).
   → Borda `border-border-subtle`.
9. **Título com fonte de vitrine e peso 700/800**, ícone gigante em estado vazio
   (`size={36}`/`40`). → Inter 600; ícone 16–20px.
10. **Emoji como ícone**, texto em CAIXA ALTA espaçada como enfeite,
    animação de entrada em lista. → Lucide, caixa normal, sem animação.
11. **Tela vazia e espaçada** com 3 cartões grandes de métrica no topo.
    → Tabela cheia, `Stat` em linha compacta quando necessário.

## Para aplicar nas telas (próxima etapa)

1. Menu lateral escuro no tema claro: no wrapper do `Sidebar` (layout do app,
   área do outro agente) adicionar `data-theme="dark"`. Nada mais muda.
2. Lugar fixo para o `ThemeToggle` (ex.: rodapé do menu ou Configurações → Aparência).
3. Migrar telas de lista (contatos, empresas, negócios em lista) para
   `PageHeader` + `ViewTabs` + `Toolbar`/`FilterButton` + `DataTable` +
   `Pagination`, com ordenação e paginação no servidor (`page`, `pageSize`,
   `sort`). O exemplo em `src/components/design-system/exemplo-contatos.tsx` é o molde.
4. Quadro de negócios: trocar a casca das colunas por `KanbanColumn` e o
   cartão por `KanbanCard` (o drag-and-drop do dnd-kit continua na tela).
5. Em cada tela migrada: tirar `glass-card`, `text-[Npx]`, hex, `rounded-2xl`,
   paleta crua de status; ao terminar, remover a ponte de status do globals.css.
