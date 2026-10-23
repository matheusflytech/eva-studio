# Quadro de negócios v4: card novo, painel lateral e animações

Data: 23/10/2026. Pedido do Matheus: o quadro "está com muita cara de IA".
Referências que ele mandou:
- **Exemplo 1** (Salessage): o quadro e o card;
- **Exemplo 2**: o painel que abre ao clicar no card.

O quadro tem que ser interativo e fluido, com GSAP.

Base: a correção do arrasto, em `fix/quadro-negocios`:
- o card original não segue mais o ponteiro;
- negócio fechado reabre ao ser arrastado;
- Perdido move na hora.

## O que sai

- **O ponto colorido antes do nome de cada etapa**, no cabeçalho da coluna e no selo da etapa no painel.
- **A porcentagem embaixo do nome da etapa.** A chance continua visível no painel.
- **As zonas Ganho/Perdido** que aparecem embaixo ao arrastar (`zonas-de-fechamento.tsx`). Ganho e Perdido viram colunas normais no fim do quadro.
- **A borda colorida de atraso no card** (`border-l-warning`). Fica só o texto discreto do sinal no rodapé, como "Retorno era ontem".

## O que fica

Filtros, visões, abas, carregar mais, regras de etapa (campos obrigatórios, motivo da perda), Desfazer na ilha, comemoração do ganho, modo Lista, busca, colunas recolhidas, ficha completa (`/negocios/<id>`).

## Coluna

- **Cabeçalho:** nome da etapa, contador em selo e, à direita, o total em R$. O "+" e o recolher continuam.
- **Botão "+ Adicionar negócio"** largo, logo abaixo do cabeçalho, contornado como no exemplo 1. Abre o "Novo negócio" já na etapa.
- **Fundo:** a coluna fica num tom sutil (`bg-raised`), e os cards ficam brancos (`bg-panel`) por cima.

## Card (padrão: exemplo 1)

1. **Topo:**
   - foto ou iniciais do contato principal e o nome dele;
   - embaixo, o nome do negócio, ou a empresa quando o funil esconde o nome;
   - à direita, o "⋯", com Abrir ficha, Mover para… e Arquivar.
   - Sem contato, o topo mostra as iniciais da empresa ou do negócio e o nome do negócio.
2. **Corpo:** pares de rótulo e valor, um embaixo do outro, com os campos escolhidos. O padrão é Valor, Previsão de fechamento e Responsável.
3. **Rodapé:**
   - ícones redondos de ação: WhatsApp (abre a conversa), Ligar (`tel:`), Nova tarefa e Nova nota;
   - à direita, o sinal do próximo passo, quando há.

Lista de campos possíveis: a que já existe em `CAMPOS_PADRAO` mais os campos personalizados (`cf:<key>`).

## Painel (padrão: exemplo 2)

Abre por cima do quadro, pela direita, sem escurecer o fundo. Substitui a prévia atual (`previa.tsx`).

- **Topo:**
  - título (o nome do negócio);
  - ⤢ (ficha completa), "⋯" e fechar;
  - Esc e clique fora fecham, e o foco volta ao card.
- **Seções**, na ordem padrão:
  1. **Detalhes:**
     - pares de ícone, rótulo e valor: Empresa, Valor, Etapa (seletor que move com as regras), Previsão, Responsável, Última interação e Criado em;
     - os botões Ganho e Perdido, para negócio aberto.
  2. **Contato principal:** cartão com foto, nome e cargo, mais botões de e-mail e WhatsApp.
  3. **Atividade recente:** a linha do tempo da ficha (`LinhaDoTempoView`), já com o histórico de alterações, e o botão "Registrar atividade", que abre a nova nota.
  4. **Tarefas:** abertas, com concluir. Fica desligada no padrão.
  5. **Produtos:** os itens do negócio. Fica desligada no padrão.
- Clicar em outro card troca o conteúdo sem fechar.

## Personalização (por pessoa)

- **O que se escolhe:**
  - card: campos e ordem (até 8), ações do rodapé e densidade;
  - painel: seções ligadas e ordem, e os campos de Detalhes (até 20).
- **Onde:**
  - "⋯ → Personalizar card", na barra do quadro;
  - "⋯ → Personalizar painel", no painel.
  - Os dois abrem uma gaveta com liga/desliga, arrastar para ordenar, prévia ao vivo e "Voltar ao padrão do funil".
- **Precedência:**
  1. o layout da pessoa para aquele funil;
  2. o layout do funil (a tela "Configurar cartão" de hoje, que passa a ter também ações e seções);
  3. o padrão do código (exemplos 1 e 2).
- **Guardado** em `eva_studio_user_card_layouts`:
  - colunas `orgId`, `userId`, `pipelineId`, `layout` (json) e `updatedAt`;
  - único por (`userId`, `pipelineId`);
  - SQL aditivo com RLS.
  - Sem a tabela, a personalização fica desligada (a gaveta avisa) e vale o layout do funil.
- **Formato do layout:**
  - os campos de hoje continuam: `campos`, `previa` (os campos de Detalhes) e `densidade`;
  - entram mais dois campos, ambos opcionais (sem eles, vale o padrão):
    - `acoes`: `("whatsapp"|"ligar"|"tarefa"|"nota")[]`;
    - `secoes`: `("detalhes"|"contato"|"atividade"|"tarefas"|"produtos")[]`.
  - Assim os layouts de funil já salvos continuam válidos.
- **Padrão novo do código:**
  - `campos: ["contato", "valor", "previsao", "responsavel"]`;
  - `previa: ["empresa", "valor", "etapa", "previsao", "responsavel", "ultimaInteracao", "criadoEm"]`;
  - `acoes: ["whatsapp", "ligar", "tarefa", "nota"]`;
  - `secoes: ["detalhes", "contato", "atividade"]`;
  - `densidade: "confortavel"`.
  - `etapa` e `ultimaInteracao` entram em `CAMPOS_PADRAO`.
  - O padrão vale para os funis sem layout salvo. Os funis com layout salvo mantêm o seu.
- **API:**
  - `GET/PUT/DELETE /api/pipelines/[id]/cartao/meu`:
    - GET devolve `{ layout, proprio, disponivel, doFunil }`;
    - PUT valida com `erroDoLayout`;
    - DELETE volta ao padrão.
  - `GET /api/deals` devolve o layout já resolvido para quem pede.

## Animações (fixas, iguais para todos; não se configuram)

- **Biblioteca:**
  - `gsap` e `@gsap/react` (`useGSAP`), com o plugin `Flip`;
  - só `transform` e `opacity`;
  - tudo dentro de `gsap.matchMedia()`: com `prefers-reduced-motion: reduce`, só opacidade (150 ms).
- **Entrada do quadro:**
  - os cards sobem 8 px e aparecem, em cascata por coluna (`stagger` de 0,03 s, 0,35 s, `power2.out`);
  - só na primeira carga do funil.
- **Hover:** o card sobe 2 px e a sombra cresce, em CSS (`transition`, 160 ms). Os ícones do rodapé passam de cinza para a cor de texto.
- **Arrasto:**
  - o card no `DragOverlay` ganha escala 1,03 e gira até ±4° na direção do movimento, com `gsap.quickTo` lendo a velocidade do ponteiro;
  - o giro volta a 0 quando o ponteiro para;
  - a coluna sob o card ganha realce suave (fundo e anel).
- **Soltar e mudar de coluna:**
  - `Flip`: o card voa da posição anterior até a vaga nova e os vizinhos se reacomodam (0,45 s, `power3.out`);
  - vale para o arrasto, para o mover do painel e para o Desfazer.
- **Números do cabeçalho:** a contagem e o total em R$ interpolam até o valor novo (0,4 s).
- **Painel:**
  - abre a partir do retângulo do card clicado (`Flip` do card para o painel) e as seções entram em sequência;
  - trocar de negócio cruza o conteúdo (saída 120 ms, entrada 180 ms);
  - fechar desliza o painel para a direita (200 ms).

## Testes

- **Unitários:**
  - precedência do layout (pessoa > funil > código) e normalização com `acoes`/`secoes` (layouts antigos continuam válidos);
  - rota `cartao/meu` (GET, PUT e DELETE; sem tabela; valida campos; cada pessoa só mexe no seu);
  - `GET /api/deals` com layout da pessoa;
  - funções puras do card (topo com e sem contato, ações disponíveis).
- **No navegador** (local, banco de produção, registros "[TESTE CLAUDE]" apagados no fim):
  - arrastar entre colunas, até Ganho e Perdido, e de Ganho para Perdido;
  - abrir o painel e trocar de negócio;
  - personalizar o card e o painel e voltar ao padrão;
  - reduzir movimento;
  - largura de celular.

## Fora do escopo

- Prioridade como campo fixo. Se quiser, entra como campo personalizado.
- Logo de empresa por URL.
- Personalizar animações.
- Mudanças na ficha completa.
