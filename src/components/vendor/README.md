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

## Decisão: os US$ 249 do ReUI não vão ser pagos (28/09/2026)

O que se queria dos blocos pagos do ReUI era a sensação de builder profissional.
Isso não vem do desenho do retângulo — vem de o canvas dizer o que aconteceu.
Então em vez de comprar bloco bonito:

- **A última execução pinta o canvas.** Cada bloco que rodou ganha anel e o
  tempo em ms; o que quebrou ganha anel vermelho e o erro no title. Sai do
  `FlowExecution` que o motor já gravava e ninguém olhava fora da aba
  Execuções. É o que o n8n faz, e é o que faltava de verdade.
- **O resto do desenho é nosso**, com os nossos tokens. Componente de terceiro
  que não sabe da nossa paleta gera duas linguagens visuais na mesma tela.
- **React Flow (MIT)** continua sendo a base, e a coleção React Flow UI (MIT,
  acima) fica disponível pra quando um componente dela couber melhor que o
  nosso. Ela não foi adotada à força: trocar handle que já funciona por handle
  de fora não é upgrade, é churn.

Ou seja: nada de licença, nada de assinatura, e o canvas ficou com informação
que bloco comprado nenhum traria.
