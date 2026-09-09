# Ativando o canal oficial (Meta Cloud API)

O código já está pronto (`src/app/api/webhooks/meta/route.ts` no app principal), mas fica inativo até existirem
essas variáveis de ambiente na Vercel:

- `META_APP_SECRET` — do painel do app em developers.facebook.com
- `META_WEBHOOK_VERIFY_TOKEN` — qualquer string que você escolher, usada só na verificação do webhook

## Pré-requisitos na conta Meta (fora do código)

1. Criar um app em developers.facebook.com com o produto "WhatsApp"
2. Business Manager verificado (documentos da empresa, domínio)
3. Se o app for atender clientes diferentes (caso do Eva Studio): submeter pra **App Review** pedindo
   "Advanced Access" da permissão `whatsapp_business_messaging`
4. No painel do app: Webhooks → configurar a URL `https://<seu-dominio>/api/webhooks/meta` e o verify token

## Depois de ativado

Cada agente precisa de uma linha em `eva_studio_meta_connections` (phoneNumberId, wabaId, accessToken) — hoje
isso só existe via inserção manual no banco; não tem UI ainda pro fluxo de "embedded signup" da Meta (conectar
clicando um botão). Isso é a próxima etapa quando o app estiver aprovado.
