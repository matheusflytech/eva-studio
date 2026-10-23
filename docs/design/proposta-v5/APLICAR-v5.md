# Aplicar a v5 no código do EvaApp (regras para os subagentes)

Repositório: D:\Skeps\repos\eva-studio-redesign (worktree, branch feat/redesign-visual). Next.js 16 + React 19 + Tailwind v4. Leia D:\Skeps\repos\eva-studio-redesign\AGENTS.md: esta versão do Next tem mudanças; consulte node_modules/next/dist/docs/ antes de usar API do Next que você não conhece.

A proposta aprovada pelo dono do produto está em HTML de referência (o alvo visual):
C:\Users\skwcx\AppData\Local\Temp\claude\D--Skeps\683e5160-c8e8-418e-bd33-f14cce0b9d3b\scratchpad\proposta\telas\<tela>.html
(o CSS das classes do mock está em ...\proposta\kit.css). É mock: use como desenho, não copie as classes. No app use Tailwind com os tokens do tema.

## O que já está feito (não mexa nestes arquivos)
- Tokens novos em src/app/globals.css e src/lib/design-system/tokens.ts (escuro fosco, preto profundo, um destaque azul #1f6fd6, texto branco no botão). Use só as classes de token: bg-page, bg-panel, bg-raised, bg-hover, bg-overlay, border-border-subtle/default/strong, text-text-primary/secondary/tertiary, bg-accent-solid, text-accent-fg, bg-accent-subtle, text-success/warning/danger/info, bg-*-subtle, bg-inverse/text-inverse-fg, cores de dado text-cat-*/bg-cat-*-subtle/bg-cat-*-solid (via CATEGORY_CLASSES). Nada de hex solto nem paleta crua do Tailwind (text-violet-400 etc.).
- src/components/ui/*: Button (cápsula), Input/fieldBase (preenchido, canto 10), Badge (cápsula), SegmentedControl (polegar invertido). Use esses componentes.
- Casca: layout do contrato, menu lateral (sidebar*), ilha dinâmica (src/components/layout/ilha.tsx), fundo vivo (src/components/layout/fundo-vivo.tsx). NÃO edite: src/app/globals.css, src/lib/design-system/*, src/components/ui/*, src/components/layout/*, src/app/(app)/[contrato]/layout.tsx.
- Para a tela conversar com a casca: `import { pulsar, avisarNaIlha } from "@/lib/fundo/eventos"`.
  - `pulsar(elemento, forca)` solta uma onda no fundo vivo a partir do elemento (use em ações: mover cartão, aplicar etiqueta, enviar mensagem). forca 1 a 2.
  - `avisarNaIlha({ titulo, detalhe?, avatar?, acao?: { rotulo, href? , aoClicar? }, duracao? })` abre a ilha com um acontecimento e uma ação (ex.: "Desfazer"). Use no lugar de toast quando a ação tem Desfazer.

## Regras da v5 (menos é mais)
- Uma superfície só: nada de `glass-card rounded-3xl` flutuando. Painéis com `rounded-2xl`/`rounded-[18px]` só quando agrupam algo de verdade; listas coladas com linhas finas (border-border-subtle).
- No máximo 1 ação principal (Button primary) e até 2 secundárias visíveis; o resto num menu "…" (DropdownMenu de src/components/ui/dropdown-menu).
- Filtros: busca + um botão "Filtros" com contador; nada de fileira de chips/selects espalhados. Os filtros que já existem continuam funcionando, só moram dentro do botão.
- Linhas de lista com no máximo 4 informações; o resto vai para o detalhe.
- Títulos de tela em text-heading/font-semibold com tracking justo; rótulos de grupo e números de apoio em `font-mono text-caption text-text-tertiary`.
- Sem tamanho de texto arbitrário (`text-[12.5px]`): use text-caption (12), text-small (13), text-body (14), text-body-lg, text-title-sm, text-title, text-heading, text-display.
- Cor só em dado (etapa, status, identidade). IA marcada pelo símbolo/nome da Eva, não por violeta.
- Português do Brasil em todo texto. Não invente recurso que não existe; não tire recurso que existe (mova para menu/detalhe).
- NÃO mude API, banco, rotas de dados nem lógica de negócio. É só apresentação e organização da tela. Mantenha todos os handlers, fetches, estados e comportamentos.
- Escreva como o código ao redor: mesmos nomes em português, comentários curtos explicando o porquê.

## Como terminar
- Rode `npx tsc --noEmit` (na pasta do repo) e `npx vitest run` e deixe ambos limpos para os seus arquivos.
- Não faça commit, não rode git stash/reset/checkout, não instale pacote.
- Responda com: arquivos alterados, o que mudou em cada um, e qualquer coisa que você não conseguiu fazer.
