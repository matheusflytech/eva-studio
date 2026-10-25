# Redesign do EvaApp — outubro de 2026

Pesquisa e direção visual para o EvaApp deixar de parecer um template gerado
e passar a parecer um CRM de trabalho, do tipo que o vendedor abre às 8h e
fecha às 18h. Escopo desta rodada: Caixa de entrada, Leads e menu lateral.
O resto do app herda os tokens e é migrado depois.

Fontes: skills `crm-design-system`, `crm-ux-pain-points`,
`crm-list-views-search`, `crm-pipeline-kanban` e `ui-ux-pro-max` (busca
`--design-system` para "CRM SaaS sales inbox B2B", densidade 8), mais a
documentação pública de Close, Kommo, RD Station e o blog
de design da Linear (links no fim).

---

## 0. Direção atual (v5): menos é mais, fundo vivo

Retorno de 22/10: "tem muito dado na tela; no consumidor final, quanto menos
coisa melhor; o que é configurável fica dentro da opção".

- **Regras de tela**: uma ação principal visível e até duas secundárias; o
  resto no "…". Filtros = busca + botão "Filtros" (sem fileira de chips).
  Linhas de lista com no máximo 4 informações. No máximo 3 KPIs, sem texto
  explicativo e sem ícone decorativo. Cada tela responde uma pergunta.
  Nenhum recurso some do produto; só sai da frente.
- **Fundo vivo**: curvas de nível (marching squares sobre ruído) que fluem
  devagar atrás de todas as telas, com superfícies translúcidas por cima.
  Cada ação gera um pulso que ondula as curvas a partir do ponto da ação
  (ilha abrindo, cartão mudando de coluna, etiqueta aplicada, venda
  fechada, tema trocado). Canvas 2D a 30 fps, só nas telas visíveis; parado
  com "reduzir movimento".
- **Esfera da Eva**: esfera de partículas que pulsa quando a Eva fala (resumo
  do dia no Início). É a presença da IA no lugar de ícones de brilho.
- **Início**: topo iridescente com as curvas, "Bom dia, Matheus!", foto,
  cartão preto com o que está na mesa e o resumo da Eva; embaixo, só
  "Esperando atendimento", "Tarefas para hoje", três atalhos e um bloco.
  "Personalizar" faz os blocos tremerem como no iPhone e abre a folha com os
  cartões que já existem no Dashboard (customização é recurso novo).
- **Dashboard**: um número grande (receita), vendas e ticket ao lado, uma
  curva suave com área em degradê e o pico marcado, e só duas leituras
  embaixo (onde o dinheiro está parado, de onde vêm as vendas). Sem ícones.
- **Editor de automação**: biblioteca de passos à esquerda para arrastar,
  gatilho como cartão grande com os números da automação, passos ligados por
  fios, grupo tracejado com cartões de cabeçalho colorido por tipo, controle
  de zoom e faixa de execuções dos últimos dias embaixo.

## 0.00 Direção v4: Alloy, vidro e preto profundo

Acréscimos de 22/10 sobre a v3, a partir do vídeo "Alloy — Contact
Management Web Dashboard Animation" (Shakuro, via Pinterest), de um menu de
conta sobreposto, de um login de vidro e de uma tela de configurações do
Untitled UI.

- **Preto profundo** no tema escuro: janela `#050505`, conteúdo `#0a0a0b`,
  menu `#0d0d0e`, cartão `#171719 → #121214`.
- **Menu que conhece a tela**: o item ativo abre os subitens dele (em
  Contatos: visões, etiquetas e segmentos) e o rodapé ganha um cartão de
  atalho ("Sem etiqueta 41") e o botão principal ("Novo contato").
- **Cartão do usuário no rodapé** (foto, nome, papel) que abre o menu da
  conta e do contrato por cima da tela, com o fundo desfocado e escurecido.
  Reúne itens que já existem: seus contratos com o papel em cada um, Trocar
  de contrato, Sua conta, Configurações do contrato, Alterar imagem, Atalhos
  de teclado, Eva Help e Sair.
- **Contatos no modelo Alloy**: lista com foto, nome, etiquetas, telefone e
  e-mail; painel arredondado com "Próximas atividades" (ligações, reuniões,
  follow-ups da semana); ao abrir um contato, a ficha desliza no lugar com
  foto grande, botões redondos, etiquetas com menu de vidro, dados em blocos,
  tarefas e negócios. A tabela continua como segunda visão.
- **Login de vidro**: cartão de canto 32 em vidro fosco sobre preto com
  feixe de luz diagonal; mesmos campos de hoje (e-mail, senha, Entrar, Criar
  conta). "Esqueceu a senha" e "Entrar com Google" não existem no app e
  ficaram de fora.
- **Configurações em linhas**: rótulo e explicação à esquerda, controle à
  direita; tema e canvas do builder escolhidos por miniaturas do próprio app.
- **Câmera em 3D** ao tocar "Ver animação" (perspectiva que endireita em
  1,5 s), como no vídeo. Sequências roteirizadas com cursor em Contatos e
  Configurações.

## 0.0 Direção v3: escuro fosco, um destaque só

Revisão pedida em 22/10 com três referências (painel "Orbit", fluxo de
automação em quadro pontilhado e um painel de faturas no conceito de app da
Apple). Vale por cima da v2 abaixo onde houver conflito.

- **Escuro fosco**: cinza neutro, sem navy e sem brilho. Janela `#0b0b0c`,
  menu `#161618`, conteúdo `#111113`, cartão com degradê curto
  `#1c1c1f → #171719` e borda branca 7%. Claro: `#f5f5f7`, `#f0f0f2`, branco.
- **Um destaque só**: o azul da Eva vai no botão principal e no dado que
  importa (a maior barra do gráfico, a etapa com mais dinheiro, a etapa
  atual). O resto do gráfico é cinza com degradê, como no Orbit.
- **Sem vícios de "cara de IA"**: sai o verde cintilante (status de sucesso
  vira verde sálvia apagado e pouco usado), sai o violeta de IA (tudo que é
  IA leva o símbolo da Eva), sai o degradê colorido de fundo, saem os
  pontos que brilham.
- **Rótulos em mono** (SF Mono/JetBrains Mono) para cabeçalho de grupo,
  variação de KPI, contadores e horários; texto em SF Pro/Inter; títulos de
  registro grandes e leves (30px, peso 500).
- **Cápsulas**: botões, filtros, chips e segmentado em cápsula; segmentado
  com polegar claro sobre trilho escuro; botões redondos para ícones.
- **Folha clara sobre fundo escuro** (3ª referência) na página do negócio:
  linha do tempo numa folha clara com o filtro preso na borda, e o cartão
  escuro com empresa, produtos e o botão Ganho.
- **Fluxos em quadro pontilhado** (2ª referência): cartões foscos de canto
  16, fios azuis finos com pontos nas junções, caminho não tomado tracejado,
  teste ao vivo mostrando cada passo girando, feito e o tempo.
- **Ilha dinâmica** no topo de toda tela: compacta mostra o que pede atenção
  agora (2 esperando, receita do mês, rascunho salvo); aberta mostra o
  evento novo com uma ação (Assumir, Desfazer, Responder, Publicar) e volta
  sozinha. Substitui os avisos soltos. No celular é a ilha do próprio iPhone.
- **Movimento por script** (Web Animations): entrada em cascata, números que
  contam, barras que crescem, cartão que muda de coluna, bolhas que chegam
  com "digitando". Toca sozinho uma vez ao aparecer, se a pessoa não pediu
  menos movimento; o botão "Ver animação" toca sempre.
- **Robusto por trás, fácil na frente**: nenhuma tela perde recurso; o que é
  raro vai para "+ Filtro", menus e painéis, e o que pede ação sobe para a
  ilha.

## 0.1 Direção anterior (v2): Eva × Apple

Depois da primeira proposta, o pedido foi "cara de aplicação da Apple",
com o estilo e as features animadas do site da Eva
(https://www.evaholdingroup.com.br/). Esta seção vale por cima das seções
4 a 8 onde houver conflito.

**O que o site da Eva usa (medido no navegador):** Plus Jakarta Sans 700 nos
títulos com tracking negativo forte (-0.03em), Inter no texto, JetBrains Mono
nos rótulos; navy em degradê (`#081021 → #111f3b → #143352`); azul
`#308ce8` com degradê até `#99ccff`; janelas de demo com raio 20px, fundo
quase preto, borda branca 10% e sombra `0 18px 50px`; animações de entrada
de 350ms (fade + translateY), três pontos "digitando", ponto "ao vivo" que
pulsa, etapas com spinner e toasts que sobem e somem.

**Linguagem de app da Apple aplicada ao EvaApp:**

- Fundo do app em degradê suave (gelo no claro, o navy do site no escuro) e
  **menu lateral translúcido** (`backdrop-filter: blur(30px) saturate(180%)`),
  ícones do menu na cor de destaque e item ativo preenchido em azul com texto
  branco, como no Finder e no Mail.
- **Título grande** em Plus Jakarta 700, 22px, na barra de cada tela.
- **Controles preenchidos**, sem moldura: botão secundário e campo em cinza
  translúcido, raio 8px; botão principal azul com brilho de 1px no topo.
- **Segmentado no estilo iOS** (trilho cinza, "polegar" branco com sombra)
  para abas de visão e filtros de status.
- **Chips e filtros em cápsula**; contador de "Esperando" em cápsula vermelha.
- **Grupos e cartões** com raio 14px e sombra curta; listas com separador
  recuado depois do avatar, como nos Ajustes do iOS; cabeçalho de grupo em
  11px caixa alta.
- **Ícone de app por agente**: squircle em degradê (Eva Holding azul,
  Drawing Club rosa, Vendedor Virtual verde-água...), igual em todas as telas.
- **Bolhas estilo iMessage**: nossas em azul com texto branco, do cliente em
  cinza; selo "Agente de IA" em violeta acima da resposta do agente.
- **Fonte do sistema** (`-apple-system`, SF Pro no Mac e no iPhone) com Inter
  como reserva no Windows e no Android; números grandes em Plus Jakarta.
- **Movimento**: linhas e cartões entram em cascata (450ms, mola curta
  `cubic-bezier(.32,.72,0,1)`, 50ms entre itens), bolhas aparecem uma a uma,
  "Esperando" e "ao vivo" pulsam, "digitando" com três pontos, interruptor
  verde do iOS com mola, aviso com Desfazer que sobe de baixo. Nada acima de
  500ms; `prefers-reduced-motion` desliga tudo.

O que continua das seções seguintes: cor só em dado, violeta só para IA,
nada abaixo de 12px, contraste AA, uma superfície por tela sem cartão
flutuando sobre cartão, e o reposicionamento de cada tela (seção 9).

---

## 1. O que dá "cara de IA" às telas de hoje

Auditoria feita no código (`conversas/page.tsx`, `lista-de-conversas.tsx`,
`leads/page.tsx`, `conversas-do-pipe.tsx`, `sidebar.tsx`, layout do contrato).

1. **Tudo é cartão flutuante.** O app é uma grade de caixas `glass-card
   rounded-3xl` com 12px de vão sobre um fundo cinza: menu lateral é uma caixa,
   o conteúdo é outra, e a Caixa de entrada são três caixas lado a lado. É o
   visual padrão de gerador de dashboard. CRM de verdade (Attio, Linear,
   Front) é **uma superfície só**, dividida por linhas finas.
2. **Raio grande em tudo.** `rounded-3xl`/`rounded-2xl` em lista, coluna,
   cartão, bolha e modal. O token achatou para 8/12px, mas o desenho continua
   de "bolhas empilhadas". Controle de CRM usa 4–8px; pílula só em etiqueta e
   avatar.
3. **Controles nativos jogados.** Na Caixa de entrada, canal e agente são dois
   `<select>` cinza do navegador, com largura cortada (`max-w-[140px]`), mais
   um checkbox "Mostrar testes" na mesma linha. São quatro faixas de controle
   (título, busca, pílulas, selects) e ~170px de altura antes da primeira
   conversa. O seletor de agente, que é a escolha mais importante da tela
   (qual site estou atendendo), parece um detalhe esquecido.
4. **Pílula invertida como filtro.** Filtro ativo em `bg-ice` (preto no claro,
   branco no escuro) pesa mais que o próprio conteúdo. Filtro é navegação
   secundária: deve sumir até ser preciso.
5. **Tamanhos inventados.** 10.5px, 11.5px, 12.5px, 13.5px espalhados à mão,
   fora da escala do design system. 10.5px é pequeno demais para leitura
   (meta de canal, status, etapa).
6. **Tokens antigos e quebrados.** `text-accent-300` não existe no tema (o
   horário e o avatar de conversa não lida perdem a cor), `bg-surface-3`,
   `text-accent-400`, `bg-ice` e `bg-black/55` convivem com os semânticos.
7. **Avatar sem identidade.** Todo contato é um círculo cinza com iniciais;
   todo agente/site é só texto. Numa lista de 40 conversas nada se distingue.
8. **Estado vazio de template.** Ícone num quadrado arredondado + título +
   frase explicativa centralizados, igual em todas as telas.
9. **Tela que se explica.** Leads abre com um parágrafo de instrução ("Arraste
   entre colunas pra mudar o estágio") e sete controles alinhados à direita do
   título (select de site, select de origem, busca, menu, botão). Produto bom
   não precisa de legenda; o controle se explica.
10. **Convenção de chat invertida.** Na aba Conversas de Leads o cliente fala
    à direita em azul, o contrário da Caixa de entrada e do WhatsApp. Quem
    alterna entre as duas telas lê a conversa ao contrário.
11. **Menu sempre navy.** No tema claro, o menu lateral é um bloco navy
    escuro dentro de um cartão arredondado. Chama mais atenção que a tela de
    trabalho (a Linear refez o menu em 2026 justamente para "recuar": menos
    contraste, ícone menor, texto inativo apagado).
12. **Fonte de vitrine no app.** Títulos em Plus Jakarta Sans e rótulo
    "eyebrow" mono em caixa alta são linguagem de site institucional, não de
    ferramenta.

## 2. Referências de mercado e o que pegar de cada uma

| Produto | O que pegar | O que evitar |
|---|---|---|
| **Linear** (refresh 2024 e 2026) | Navegação recua para o trabalho aparecer: menu com texto inativo apagado, ícones menores, menos separadores ("estrutura se sente, não se vê"), cabeçalho previsível com as mesmas ações no mesmo lugar | Tema escuro como padrão |
| **Attio** | Canvas branco, linhas finas, uma cor de acento só para link/foco/seleção, Inter 500 como peso de interface, avatar e chip de relação em toda célula | Marketing com serifa |
| **Caixa de entrada (padrão de mercado)** | Trocar de caixa (inbox) por um menu no topo esquerdo; visões por responsável, canal e status | Bordas pesadas `#cbd6e2` e raio grande em tudo |
| **Front / Intercom / Kommo** | Três colunas lista ∣ conversa ∣ contexto do cliente, coladas, sem vão | Kommo: arco-íris de etapas e fundo de coluna pintado |
| **Funil (padrão de mercado)** | Cartão do funil com título, contato, valor, dono e sinal de atividade; contagem e soma no topo da coluna | Canvas cinza com cartões brancos |
| **Close** | Caixa de entrada como lista de trabalho do dia; filtros em um botão "Filtros", não espalhados | Visual utilitário demais |
| **Folk** | Calor de SMB sem perder densidade: avatar colorido, chip de etiqueta suave | Ilustração em todo estado vazio |
| **RD Station CRM** | Vocabulário que o vendedor brasileiro já conhece (Funil, Negociação, Ganhou/Perdeu, Tarefas) | Azul da marca pintando menu e cabeçalho |

## 3. Princípios desta rodada

1. **Uma superfície, linhas finas.** Fim do cartão flutuante dentro da área de
   trabalho. Colunas da Caixa de entrada e do funil se separam por `1px` de
   borda sutil. Sombra só em camada flutuante (menu, popover, modal, toast).
2. **O controle principal vem primeiro.** Na Caixa de entrada, a primeira
   coisa é **qual caixa (site/agente) estou vendo**; ela vira o título da
   coluna. Em Leads, o pipe (site) é o seletor ao lado do título.
3. **Filtro some até ser preciso.** Status vira aba de texto com contador;
   canal e "mostrar testes" vão para um botão "Filtros" com contador do que
   está ativo.
4. **Cor só carrega dado.** ~90% neutro. Azul em botão primário, link, foco e
   item selecionado. Cor de etapa em chip suave e ponto. Violeta reservado
   para IA. Verde do WhatsApp só no ícone do canal.
5. **Identidade em cada linha.** Avatar com matiz determinístico (hash do id)
   para contato; quadrado arredondado com a inicial e a cor do site para cada
   agente. A mesma marca do site aparece no seletor, na linha da conversa e no
   cartão de lead.
6. **Escala, não número solto.** Só os tamanhos da escala (12/13/14/16/18/20).
   Nada abaixo de 12px.
7. **Pensar no cliente final.** O atendente precisa ver em um relance: quem
   espera há quanto tempo, de qual site, em que etapa. Tudo o que não ajuda
   nisso sai da linha.

## 4. Paleta

Mantém a identidade da Eva Holding (tinta navy, azul de marca), mas tira o
cinza do canvas e escurece o azul de ação para o texto branco passar AA.
Contraste medido com script (WCAG 2.x).

### Claro

| Token | Hoje | Novo | Nota |
|---|---|---|---|
| surface-page | `#f5f7fa` | `#ffffff` | canvas branco (Attio/Linear) |
| surface-panel | `#ffffff` | `#ffffff` | |
| surface-sidebar (novo) | navy | `#f7f8fa` | menu um degrau fora do canvas |
| surface-raised | `#eef1f6` | `#f1f3f6` | cabeçalho de coluna, chip neutro |
| surface-hover | `#e2e6ee` | `#e9edf2` | |
| border-subtle | `#e6e8ed` | `#e8ebf0` | divisória |
| border-default | `#d4d8e1` | `#dde1e8` | campo, overlay |
| text-primary | `#0f1a2e` | `#0f1a2e` | 17,4:1 |
| text-secondary | `#5b667b` | `#475467` | 7,7:1 |
| text-tertiary | `#5e6778` | `#5f6b7e` | 5,4:1 no branco, 4,9:1 no raised |
| accent-solid | `#308ce8` + texto navy | `#1f6fd6` + texto branco | 4,9:1; o `#308ce8` antigo com branco dava 3,4:1 |
| accent-solid-hover | `#519eec` | `#1a62c0` | escurece no hover, não clareia |
| accent-fg | `#1361ae` | `#1a5fbf` | link e item ativo, 6,1:1 |
| accent-subtle | `#eaf4fd` | `#ebf3fe` | linha selecionada |

### Escuro

| Token | Hoje | Novo |
|---|---|---|
| surface-page | `#080d17` | `#0b111c` |
| surface-sidebar (novo) | — | `#080c15` |
| surface-raised | `#121b2b` | `#131a28` |
| surface-hover | `#20293c` | `#1b2333` |
| text-primary | `#f1f5f9` | `#e8edf4` (16:1) |
| text-secondary | `#a9b5c6` | `#a6b1c2` (8,7:1) |
| text-tertiary | `#8d9bb0` | `#8b97aa` (6,4:1) |
| accent-solid | `#308ce8` + navy | `#2872d2` + branco |
| accent-fg | `#99ccff` | `#8cc2ff` (10:1) |

### Cor de dado

- **Etapas** (chip suave fundo step 3 + texto step 11, ≥5:1): Novo slate,
  Contatado blue, Qualificado violet, Ganho green, Perdido red. Ponto de 8px
  ao lado do nome. Coluna **não** é pintada.
- **Sites/agentes**: matiz fixo por hash do id entre blue, teal, violet,
  amber, rose, cyan, indigo, orange (os `--cat-*` que já existem).
- **IA**: `--ai` violeta só em resposta do agente marcada como IA, resumo e
  sugestão.
- **Status da conversa**: Esperando = chip `danger` suave com ponto e texto
  (nunca só cor); Com humano = avatar do responsável; Agente = ícone de bot
  em texto terciário; Encerrada = texto terciário.

## 5. Tipografia

- **Inter** em toda a interface, com `cv11` (a de um andar) e `ss03`. Peso
  400 texto, 500 rótulo/botão/nome, 600 título. Nunca 700 no app.
- **Base 13px** em lista, tabela, menu e controle (Linear, Attio, Twenty).
  14px em texto de conversa e nota longa. Campo de texto 16px no celular
  (evita zoom do iOS).
- Títulos de tela em Inter 600, 18px, `-0.01em`. Plus Jakarta Sans fica
  para login e páginas públicas; o "eyebrow" mono sai das telas de trabalho.
- Telefone e IDs em `tabular-nums`; valores em `Intl.NumberFormat('pt-BR')`.
- Escala usada: 12 (meta, chip), 13 (base), 14 (conversa), 16 (campo no
  celular), 18 (título de tela), 20 (título de registro).

## 6. Densidade e layout

- **Casca**: menu lateral 240px colado na borda esquerda, sem cartão, fundo
  `surface-sidebar`, separado do conteúdo por uma linha. Conteúdo ocupa o
  resto sem vão nem raio. Recolhido: 56px só com ícones.
- **Menu**: itens de 32px, ícone 16px stroke 1.75, texto inativo
  `text-secondary`, ativo em `surface-hover` + texto primário + ícone em
  acento (não mais fundo azul). Contador alinhado à direita em 12px.
- **Caixa de entrada**: lista 340px ∣ conversa ∣ contexto 320px, coladas.
  Cabeçalho da lista em três faixas de 40px: seletor de caixa, busca +
  Filtros, abas de status. Linha de conversa ~72px.
- **Leads**: barra de 48px (título + contagem + seletor de pipe à esquerda;
  busca, Filtros, menu e "Novo lead" à direita), abas Quadro ∣ Conversas
  logo abaixo. Coluna de 280px com fundo `surface-raised` 50%, raio 8px,
  cabeçalho com ponto da etapa, nome, contagem. Cartão branco, borda
  sutil, raio 8px, sem sombra parada; sombra pequena no hover.
- **Celular**: Caixa de entrada mostra só a lista (como o WhatsApp), conversa
  abre por cima com botão voltar; seletor de caixa vira folha de baixo para
  cima com alvos de 44px.

## 7. Componentes

### Seletor de caixa (`SeletorDeAgente`)

O controle que o usuário chamou de "muito feio e jogado". Vira um botão no
lugar do título "Conversas":

```
[■ E] Eva Holding          ▾        ← quadrado de 24px na cor do site
      12 conversas · 3 esperando
```

- Abre um menu (Radix DropdownMenu) com "Todas as caixas" no topo e cada site
  com seu quadrado colorido, nome e contador de não lidas à direita. Marca de
  seleção no ativo. Busca dentro do menu quando houver mais de 6 sites.
- Em "Todas as caixas", cada linha da lista mostra o quadradinho do site
  (14px) antes do canal, para saber de onde veio sem ler.
- Reaproveitado em Leads como seletor de pipe (mesmo componente, mesma cor
  por site).
- Escolhido em vez de controle segmentado porque o número de sites cresce
  (hoje Eva Holding e Drawing Club; amanhã cinco) e o segmentado quebra em
  340px.

### Abas de status

Texto 13/500, sublinhado de 2px no ativo, contador em 12px tabular
(vermelho suave só em "Esperando"). Substitui as pílulas `bg-ice`.

### Botão Filtros

Ícone de funil + "Filtros" + contador do que está ativo. Abre popover com
Canal (lista com ícone de cada canal) e o interruptor "Mostrar conversas de
teste". Um "Limpar" no rodapé.

### Linha de conversa

Avatar 36px com matiz do contato (bolinha azul de não lida à esquerda) ·
nome 13/500 (600 se não lida) · hora à direita (azul se não lida) · prévia
13px em uma linha · linha de meta 12px: status, ícone do canal, quadradinho
do site, chip da etapa do negócio. Selecionada: `accent-subtle` com barra
de 2px à esquerda.

### Cartão de lead

Avatar 28px + nome 13/500 + tempo relativo · e-mail e telefone em 12px ·
rodapé com chip de origem (ícone + texto) e quadradinho do site. Seleção por
checkbox real (Radix), não o caractere "✓".

### Estados vazios

Sem quadrado decorativo. Ícone 20px em texto terciário, uma linha em 13/500 e
uma linha de apoio; ação quando houver ("Limpar filtros").

## 8. Movimento

75ms em hover, 150ms em menu e popover, 200ms em diálogo, nada acima de
300ms; só `opacity`/`transform`. Mantém o `prefers-reduced-motion` global.

## 9. Tela a tela

Proposta visual completa (print de hoje × proposta, claro e escuro) no
artifact da proposta. Resumo do que muda em cada tela:

| Tela | Hoje | Proposta |
|---|---|---|
| Início | Cartão de boas-vindas + lista de alertas em cartões | Saudação na barra, alertas agrupados por urgência (Agora, Hoje, Agentes) com número em destaque e ação na linha; agentes numa coluna lateral |
| Caixa de entrada | 3 caixas flutuantes, 2 `<select>` nativos, 4 faixas de controle | Seletor de caixa com cor do site, abas de status, Filtros, colunas coladas, IA em violeta |
| Celular | Menu no hambúrguer; em Negócios o quadro só aparece depois de rolar | Barra de navegação embaixo; Negócios uma etapa por vez; alvos de 40px |
| Negócios | Recado da Eva, tendências, "Desde ontem" e "Pede atenção" ocupam metade da altura; 3 linhas de filtro; seletor de estilo Eva · 1/2/3 | Faixa de IA de 40px com contadores; abas de visão; filtros ativos como chip e "+ Filtro"; coluna com contagem, chance e soma; cartão com sinal de próxima atividade e parado |
| Página do negócio | Formulário de caixas de input, 5 cartões na direita | Ganho/Perdido no topo, linha de fatos, trilha com tempo por etapa, campos rótulo–valor com edição inline, linha do tempo com ícone por tipo |
| Leads | Parágrafo de instrução + 7 controles; coluna Novo cheia de "Sem nome" | Barra de 52px com seletor de site; lead sem nome mostra telefone; etapa por cor de dado |
| Contatos, Contato, Empresas | Tabela com paginação, painel lateral de formulário, grade de cartões | Grade estilo Attio com ícone por tipo de campo e contagem total; visão 360 do contato; empresas em tabela densa |
| Tarefas, Dashboard, Insights | Listas e cartões soltos | Fila do dia com urgência; KPIs em faixa; gráficos com escala e tokens |
| Agentes, Playground, Biblioteca, Integrações | Cartões grandes por agente/modelo | Lista densa com status e alerta na linha; identidade do agente pelo quadrado colorido |
| Automações, Sequências, Disparos, Aprovações | Telas vazias ou formulário longo centralizado | Lista com estado e números; criação com prévia ao lado; aviso inline no lugar de tela vazia |
| Configurações | Abas horizontais de 9 seções | Navegação lateral de seções e formulário rótulo–campo |

## 10. Ordem de aplicação

1. Tokens (claro/escuro) + espelho em `src/lib/design-system/tokens.ts`.
2. Caixa de entrada: seletor de caixa, abas, Filtros, linha, colunas coladas.
3. Leads: barra, seletor de pipe, quadro, aba Conversas.
4. Menu lateral e casca (depende do layout do contrato, que está sendo mexido
   na branch `feat/contrato-id-curto`; entra quando aquela branch for para a
   `main`).
5. Demais telas.

## Fontes

- Linear, *Behind the latest design refresh* (2026): https://linear.app/now/behind-the-latest-design-refresh
- Linear, *How we redesigned the Linear UI*: https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear changelog, UI refresh 12/03/2026: https://linear.app/changelog/2026-03-12-ui-refresh
- Close, *Inbox*: https://help.close.com/docs/inbox.md
- Kommo, *Incoming leads*: https://www.kommo.com/support/crm/incoming-leads/
- RD Station, *Funil de vendas*: https://www.rdstation.com/crm/funil-de-vendas/
- Referência de tokens Attio (terceiros): https://styles.refero.design/style/08c8700c-f278-42bc-812e-f60dc6ce996e
