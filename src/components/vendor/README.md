# Componentes de terceiros

Pasta reservada para o que vem de fora pelo CLI do shadcn: React Flow UI,
blocos de canvas, e qualquer outra coleção do ecossistema shadcn.

**Por que separado de `src/components/ui`:** ali ficam os nossos componentes,
escritos à mão e com a nossa API. Misturar as duas coisas na mesma pasta faz
com que uma atualização do CLI sobrescreva componente nosso sem aviso, e faz
ninguém saber mais o que é nosso e o que é de fora. O `components.json` aponta
o alias `ui` para cá justamente por isso.

## Como instalar algo

```bash
npx shadcn@latest add https://ui.reactflow.dev/base-node
```

O componente cai em `src/components/vendor/ui/` e já nasce na paleta do Eva
Studio: a ponte de tokens em `src/app/globals.css` declara `--background`,
`--card`, `--primary` e o resto do vocabulário do shadcn em função dos nossos
tokens (`--bg-base`, `--bg-surface-1`, `--accent-500`). Não editar valor de cor
aqui: a fonte de verdade continua sendo o bloco de tokens do `globals.css`.

## O que dá pra usar, e o que custa

| Coleção | Licença | O que tem |
|---|---|---|
| [React Flow UI](https://reactflow.dev/ui) | **MIT, grátis** | Base Node, handles rotulados, edges com botão, busca de nó, zoom slider, devtools |
| [Overflow UI](https://www.overflow.dev/) | **MIT** na camada de UI | 15 componentes de canvas; as interações avançadas são pagas |
| [ReUI](https://reui.io) | MIT no básico, **blocos de fluxo pagos** (US$ 249, único) | Blocos prontos de builder de workflow e de agente |

React Flow UI não exige assinatura do React Flow Pro. O que exige Pro são os
*templates* completos (como o "AI Workflow Editor"), não os componentes.
