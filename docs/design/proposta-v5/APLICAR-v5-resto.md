# Complemento para as telas restantes (leia junto com APLICAR-v5.md)

Já está no app (veja como referência de acabamento, mas NÃO edite):
- Início: src/app/(app)/[contrato]/inicio/page.tsx
- Negócios: src/app/(app)/[contrato]/negocios/page.tsx e src/components/crm/negocios/*, src/components/crm/negocio/*
- Contatos: src/components/crm/contatos/*
- Caixa de entrada: src/components/inbox/*
- Leads: src/app/(app)/[contrato]/leads/page.tsx

Também fora do seu alcance (outros agentes estão editando ao mesmo tempo): qualquer arquivo que não esteja na sua lista. Em especial src/components/crm/listas/*, src/components/ui/*, src/components/layout/*, src/components/design-system/*, src/components/busca/*, src/components/contrato/*, globals.css, tokens.ts. Se precisar de mudança num desses, NÃO faça: descreva no relatório.

Padrões já usados nas telas prontas (repita):
- Página com respiro: raiz `flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6` (o topo do conteúdo já tem a faixa de 44px da ilha acima).
- Barra da tela numa linha: título `text-heading font-semibold tracking-tight text-text-primary` + contagem em `font-mono text-caption text-text-tertiary` ("125 no total"), à direita busca, "Filtros" com contador, "…" e a ação principal.
- Abas de visão em cápsula (SegmentedControl ou o mesmo visual feito com classes locais: trilho `rounded-full border border-border-subtle bg-raised p-0.5`, ativo `bg-inverse text-inverse-fg`).
- Cartões/painéis: `rounded-[18px] border border-border-subtle bg-panel`; blocos internos `rounded-[14px] bg-raised`. Sem sombra em repouso.
- Linhas de lista 44–58px, separadas por `border-border-subtle`, hover `bg-raised`.
- Estados vazios: uma frase curta + uma ação; nada de ilustração grande.
- Esqueletos: `animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none`.
- Sem ícone decorativo em número/KPI (o dono vetou joinha, cifrão, alvo). Número grande `text-[34px]`-ish via `text-display` com `tabular-nums`, rótulo pequeno acima.
- Ações com efeito: `pulsar(el, 1.2)` e, quando houver Desfazer, `avisarNaIlha` no lugar do toast.
- Responsivo: tem que caber em 375px sem rolagem horizontal da página (tabela pode rolar dentro do próprio contêiner).
- Funcionar no claro e no escuro só com tokens.
