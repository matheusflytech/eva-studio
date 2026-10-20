# Design system do Eva Studio

Página viva: **/design-system** (dentro do app, com login). Tokens em
`src/app/globals.css`, espelho em TS em `src/lib/design-system/tokens.ts`,
componentes em `src/components/ui`.

**Identidade:** a da Eva Holding (site oficial evaholdingroup.com.br): escala
navy, tinta com leve tom azulado (matiz 215–220), azul da marca `#308ce8`,
títulos em Plus Jakarta Sans, interface em Inter e rótulo de seção em
JetBrains Mono caixa alta. Tema claro = fundo `#f5f7fa`, superfícies brancas,
texto navy; menu lateral em navy da marca; tema escuro = escala navy (não
cinza neutro).

Direção: **Minimalism & Swiss Style** (recomendação da skill ui-ux-pro-max para
CRM SaaS), densidade alta, movimento mínimo, sem decoração. Referência: CRM de
mercado denso e limpo — tela preenchida, tabela larga, filtros em linha como
texto, cor quase só em status.

## Princípios

1. **Dado primeiro.** A tela existe para mostrar registros. Tabela larga e cheia,
   linhas de 40px, nada de cartão gigante com três números.
2. **Hierarquia por tipografia e espaçamento**, não por cor, borda colorida ou
   brilho. Título maior e mais pesado; secundário em `text-text-secondary`.
3. **Uma cor de marca** (`#308ce8`). O azul do acento aparece no botão primário, no link, no
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
| Acento | `bg-accent-solid` + `text-text-on-accent`, `hover:bg-accent-solid-hover`, `text-accent-fg`, `bg-accent-subtle` | botão primário; link e ação em texto; linha/visão/item de menu selecionado |
| Sobre cor | `text-text-on-accent` (navy), `text-text-on-danger` (branco) | texto sobre o azul da marca; texto sobre o vermelho do botão de perigo |
| Status | `text-success` / `bg-success-subtle`, `text-warning` / `bg-warning-subtle`, `text-danger` / `bg-danger-subtle` / `bg-danger-solid`, `text-info` / `bg-info-subtle` | só badge, ícone e texto de status |
| Foco / inverso | `outline-focus`, `bg-inverse`, `text-inverse-fg`, `bg-backdrop` | anel de foco; tooltip; véu do modal |

Valores (claro / escuro):

| Token | Claro | Escuro |
|---|---|---|
| surface-page | #f5f7fa | #080d17 (navy-950) |
| surface-panel | #ffffff | #0b1322 (navy-900) |
| surface-raised | #eef1f6 | #121b2b (navy-800) |
| surface-hover | #e2e6ee | #20293c (navy-700) |
| surface-overlay | #ffffff | #121b2b |
| border-subtle / default / strong | #e6e8ed / #d4d8e1 / #bbc2cf | #1d273a / #263146 / #35425b |
| text-primary / secondary / tertiary | #0f1a2e / #5b667b / #5e6778 | #f1f5f9 / #a9b5c6 / #8d9bb0 |
| text-disabled | #a2aab9 | #525e6f |
| text-on-accent | #080d17 (navy sobre o azul) | #080d17 |
| text-on-danger | #ffffff | #ffffff |
| accent-solid / hover | #308ce8 / #519eec | #308ce8 / #519eec |
| accent-fg / subtle | #1361ae / #eaf4fd | #99ccff / #112642 |
| success fg / subtle | #17734a / #e7f5ee | #4cc38a / #11261b |
| warning fg / subtle | #935a00 / #fcf2df | #e3a547 / #2a2010 |
| danger fg / subtle / solid | #c22f2f / #fdeded / #c22f2f | #f07575 / #2d1617 / #c43b3b |
| info fg / subtle | #1f66a8 / #e8f1fa | #6cb1ef / #122338 |
| focus-ring | #308ce8 | #99ccff |

### Contraste (WCAG 2.x, calculado e testado)

Todos os pares de `CONTRAST_PAIRS` passam nos dois temas (teste em
`src/lib/design-system/design-system.test.ts`). Piores casos:

| Par | Claro | Escuro |
|---|---|---|
| text-tertiary sobre surface-hover | 4,55 | 5,16 |
| text-secondary sobre surface-hover | 4,62 | 7,00 |
| texto navy sobre accent-solid (#308ce8) | 5,59 | 5,59 |
| accent-fg sobre accent-subtle | 5,63 | 9,01 |
| focus-ring sobre surface-page (mín. 3) | 3,24 | 11,51 |

Por que o texto do botão primário é navy e não branco: branco sobre
`#308ce8` dá 3,5:1 (reprova AA). Para manter o azul exato da marca no botão,
o texto sobre ele é `navy-950`. O botão de perigo continua com texto branco
(`text-on-danger`).

A tabela completa está na página viva (seção Contraste).

Exceção consciente: bordas de separação e de campo ficam entre 1,15 e 1,4:1
(padrão de CRM de mercado). Campo é identificado pelo rótulo visível e o foco
tem anel de 2px com contraste ≥ 5:1.

### Tipografia

**Três famílias, cada uma com um papel** (as do site da Eva):

- **Plus Jakarta Sans** (`font-display`), peso 700, espaçamento levemente
  negativo (`tracking-tight`): só título de página (`PageHeader`) e número
  grande (`Stat size="lg"`). Nunca em tabela, rótulo ou botão.
- **Inter** (`font-sans`, padrão do body): toda a interface. Desenhada para
  12–14px e com algarismos tabulares (`tabular-nums`).
- **JetBrains Mono**: o rótulo de seção `eyebrow` ("O QUE MOVEMOS": caixa
  alta, espaçamento largo, cor do acento, 12px) e código. Um por seção, no
  máximo; não é enfeite de cartão.

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

Peso: 400 texto, 500 rótulo/ênfase, 600 título de seção; 700 só no título em
Plus Jakarta (página e número grande). Nada de 800.
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
| `ViewTabs` | Visões de uma lista (de sistema e salvas), com contagem, "+", ponto de "alterações não salvas" (`dirty`), dica (`hint`) e menu da aba ativa (`menu`). |
| `BulkActionBar` | Barra flutuante embaixo, no centro, quando há linhas selecionadas: contagem, "Selecionar todos os N resultados" (ação vai pelo filtro), ações `Button size="sm" variant="ghost"` (destrutiva por último) e limpar. Lógica em `src/components/crm/listas/acoes-em-massa.tsx`. |
| `Modal` | Decisão curta que bloqueia (confirmar, criar com 2–3 campos). |
| `Drawer` | Detalhe de registro, formulário longo, filtros avançados. |
| `DropdownMenu` | Ações de linha, "Mais", ordenar. `tone="danger"` no item destrutivo. |
| `Tooltip` | Nome de ícone, dica curta. Nunca a única fonte de informação. |
| `Toast` (`useToast`) | Confirmação curta do que já aconteceu. Erro de campo não vai em toast. |
| `EmptyState` | Lista/painel vazio: o que falta + próximo passo. `compact` dentro de tabela. |
| `Card` / `Panel` | Agrupar conteúdo. `Panel` tem cabeçalho com ações e `flush` para tabela. |
| `PageHeader` | Topo da página: `eyebrow` opcional, título em Plus Jakarta 700, descrição de uma linha, ações (≤ 1 primário). |
| `Toolbar` | Linha de filtros à esquerda e ações à direita, acima da tabela/quadro. |
| `FilterButton` | Filtro em linha "Proprietário ▾"; contagem quando há seleção; menu de múltipla escolha com busca. Lista grande (contatos): `onSearchChange` busca no servidor. |
| `DateFilterButton` | Filtro de data em linha ("Criado em ▾"): hoje, 7/30/90 dias, este mês ou intervalo; escolha única. Lógica em `src/lib/listas/estado-da-lista.ts`. |
| `SearchInput` | Busca da barra da lista (lupa, limpar). Rótulo em `aria-label`. |
| `SegmentedControl` | Alternar poucos modos da mesma tela (Quadro | Lista). Não é filtro nem visão. |
| `ColumnPicker` | "Editar colunas": gaveta para escolher e ordenar colunas (fixas não saem). Lógica em `src/lib/listas/colunas.ts`. |
| `PhoneNumber` | Telefone com bandeira (SVG local em `public/bandeiras`) e formatado "+55 21 98171-0669" (`src/lib/telefone.ts`). |
| `Notice` | Aviso em linha acima da tabela/quadro (info, warning, danger): fundo sutil de status, sem borda colorida. |
| `DataTable` | Lista de registros. Cabeçalho fixo (passe `max-h-*`), ordenação com `aria-sort`, seleção com "Selecionar página", números à direita, `loading` e `empty`. Ordem/paginação controladas por fora (servidor). |
| `Pagination` | Abaixo da tabela: itens por página 25/50/100, "1–25 de 24.752", números com reticências. |
| `Stat` | Número + rótulo + variação escrita com seta. `inverse` quando subir é ruim. |
| `KanbanColumn` / `KanbanCard` | Casca do quadro: cabeçalho (nome, contagem, `headerActions`, recolher), cartões simples, rodapé Total e Ponderado (+ `footerNote`, ex.: "30 de 120 carregados"). Drag-and-drop fica na tela: `containerRef` recebe o alvo de soltar e `highlighted` mostra "solte aqui". |
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
   brilho que "respira" (`eva-respira`, já removido de Negócios na L3);
   gradiente de três cores (`src/components/agent-studio/builder/conversation-mode.tsx:178`).
   → Fundo liso `bg-page`/`bg-panel`. O degradê azul → `#99ccff` do site da Eva
   não entra no produto (no máximo num único lugar de marca; hoje, nenhum).
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

1. Menu lateral em navy da marca nos dois temas: o wrapper do `Sidebar` tem
   `data-theme="dark"` (que agora é a escala navy) e o item ativo usa
   `bg-accent-subtle text-accent-fg`.
2. Lugar fixo para o `ThemeToggle` (ex.: rodapé do menu ou Configurações → Aparência).
3. Migrar telas de lista (contatos, empresas, negócios em lista) para
   `PageHeader` + `ViewTabs` + `Toolbar`/`FilterButton` + `DataTable` +
   `Pagination`, com ordenação e paginação no servidor (`page`, `pageSize`,
   `sort`). O exemplo em `src/components/design-system/exemplo-contatos.tsx` é o molde.
4. Quadro de negócios: trocar a casca das colunas por `KanbanColumn` e o
   cartão por `KanbanCard` (o drag-and-drop do dnd-kit continua na tela).
5. Em cada tela migrada: tirar `glass-card`, `text-[Npx]`, hex, `rounded-2xl`,
   paleta crua de status; ao terminar, remover a ponte de status do globals.css.
