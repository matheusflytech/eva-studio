# Ativando os canais oficiais (Meta Cloud API + Instagram)

O código já está pronto (`src/app/api/webhooks/meta/route.ts` no app principal, um webhook só pros dois canais),
mas fica inativo até existirem essas variáveis de ambiente na Vercel:

- `META_APP_SECRET` — do painel do app em developers.facebook.com
- `META_WEBHOOK_VERIFY_TOKEN` — qualquer string que você escolher, usada só na verificação do webhook

Passo a passo completo (verificação de negócio, criação do app, App Review) em `docs/meta-business-runbook.html`.

## WhatsApp — conexão via Embedded Signup

Além das duas variáveis acima, o botão "Conectar com a Meta" na aba do agente
(`src/components/agent-studio/meta-whatsapp-connect.tsx`) precisa de:

- `META_APP_ID` / `META_APP_SECRET` — usados no servidor pra trocar o `code` do widget por um token de verdade
- `NEXT_PUBLIC_META_APP_ID` — id do app, exposto pro widget de login no navegador
- `NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID` — id da configuração de Embedded Signup (criada no painel do app, em
  WhatsApp > Configuração do Embedded Signup)

Sem essas duas `NEXT_PUBLIC_*`, o card mostra a mensagem de "canal ainda não configurado" em vez do botão —
até lá, dá pra inserir a linha em `eva_studio_meta_connections` (phoneNumberId, wabaId, accessToken) direto no
banco, como já era feito antes desse botão existir.

## Instagram — Instagram Login (OAuth) ou conexão manual

O botão "Continuar com Instagram" (`src/components/agent-studio/instagram-connect.tsx`,
callback em `src/app/api/instagram/oauth/callback/route.ts`) precisa de:

- `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` — usados no servidor pra trocar o `code` por um token de verdade
- `NEXT_PUBLIC_INSTAGRAM_APP_ID` — id do app Instagram, exposto pro navegador montar a URL de autorização

Esses ids/secret ficam no painel do app, em Instagram > API setup with Instagram login — **são diferentes** do
`META_APP_ID`/`META_APP_SECRET` do WhatsApp, mesmo os dois produtos vivendo no mesmo app Meta. Sem essas
variáveis, o card mostra o formulário manual (pede `igBusinessId` e `pageAccessToken` obtidos no painel do app,
ver `docs/meta-business-runbook.html` §02) como já era feito antes desse botão existir.

## Automações de comentário (ManyChat-style)

Já funcionam sem precisar de conta Instagram conectada de verdade — o simulador na aba do agente ("Automações
de comentário") deixa testar o casamento de palavra-chave e a conversa que viria depois, usando o mesmo motor
de fluxo. Ver `docs/CHATBOT_ENGINE.md` §11.

## Pré-requisitos na conta Meta (fora do código)

1. Criar um app em developers.facebook.com, tipo "Empresa", com os produtos "WhatsApp" e "Instagram"
2. Business Manager verificado (documentos da empresa, domínio)
3. Como o app atende clientes diferentes (caso do Eva Studio): submeter pra **App Review** pedindo Advanced
   Access de `whatsapp_business_management`/`whatsapp_business_messaging` e, se for usar Instagram também,
   `instagram_business_manage_messages`
4. No painel do app: Webhooks → configurar a URL `https://<seu-dominio>/api/webhooks/meta` e o verify token
   (serve pros dois produtos, o mesmo endpoint distingue pelo formato do payload)
