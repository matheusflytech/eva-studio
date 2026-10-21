# n8n-nodes-eva-studio

Nós do [n8n](https://n8n.io) para o **Eva Studio** (CRM com agentes de IA no WhatsApp, Instagram e outros canais).

- **Eva Studio** (ação): contatos (criar, criar ou atualizar, ler, listar, alterar), negócios (criar, ler, listar,
  alterar, mover de etapa, ganho, perdido), tarefas, notas e **mandar mensagem pelo agente**. Pode ser usado como
  ferramenta do AI Agent do n8n (`usableAsTool`).
- **Eva Studio Trigger** (gatilho): começa o workflow quando um negócio é ganho, muda de etapa, um contato é criado,
  chega mensagem etc. Ao ativar o workflow, o nó assina os eventos no Eva Studio; ao desativar, cancela. Toda entrega
  tem a assinatura (Standard Webhooks) conferida antes de seguir.

Sem dependências de runtime. Licença MIT.

## Credencial

1. No Eva Studio: Integrações → Chaves de API → crie uma chave só com os escopos que o workflow usa. O gatilho precisa
   de `webhooks:*`; mandar mensagem precisa de `messages:write`.
2. No n8n: credencial **Eva Studio API** com a chave e o endereço da API (está em Integrações → n8n e webhooks, termina
   em `/api/v1`). O botão de teste chama `GET /me`.

## Eventos do gatilho

`contact.created`, `contact.updated`, `lead.captured`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`,
`deal.reopened`, `task.completed`, `message.received` ou `*` (todos). O corpo traz `data` (o objeto no mesmo formato
da API) e, nas mudanças, `previous` com o que mudou. Use `webhook_id` para não processar a mesma entrega duas vezes:
o Eva Studio tenta de novo por cerca de um dia e meio quando o n8n não responde 2xx.

## Modelos de workflow (`templates/`)

| Arquivo | O que faz |
| --- | --- |
| `negocio-ganho-para-erp.json` | Negócio ganho → monta o cliente → HTTP para o ERP → anota no negócio |
| `lead-do-formulario.json` | Formulário (Webhook) → limpa os dados → cria ou atualiza o contato → modelo de boas-vindas no WhatsApp |
| `responder-depois.json` | Bloco "Enviar para o n8n" do agente → responde na hora "um instante" → consulta um sistema → manda a resposta pelo agente |

Importe pelo menu do n8n (Import from File) e troque os `SEU-...` e `ID-...`.

## Desenvolvimento

```bash
npm install
npm run build
npm test
```

Para testar num n8n local: `npm run build`, depois `npm link` aqui e `npm link n8n-nodes-eva-studio` em
`~/.n8n/custom`.

Antes de publicar no npm (e pedir a verificação do n8n): rodar `npx @n8n/scan-community-package n8n-nodes-eva-studio`
e publicar por GitHub Actions com npm provenance, como o n8n exige desde maio de 2026.
