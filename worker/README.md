# Eva Studio — worker de WhatsApp (Baileys)

Processo separado, sempre ligado — o Baileys mantém um socket aberto com o WhatsApp, o que não roda em função
serverless da Vercel. Este worker só precisa da mesma `DATABASE_URL` do app principal; toda a comunicação entre
o app e o worker acontece através das tabelas `eva_studio_whatsapp_connections` (o worker faz polling a cada
4s) — não existe API própria além de um health check em `/`.

## Deploy no Railway

1. Novo projeto → Deploy from GitHub repo → aponte pra este repositório, **root directory: `worker`**
2. Variável de ambiente: `DATABASE_URL` (a mesma da Vercel)
3. Start command já vem do `package.json` (`npm start` → `node index.js`)
4. Sem porta fixa necessária — o worker escuta em `process.env.PORT` (Railway injeta isso sozinho)

## Rodando local pra testar

```bash
cd worker
npm install
DATABASE_URL="postgresql://..." npm start
```

Depois é só clicar em "Conectar via QR code" na página do agente no Eva Studio — o worker detecta o pedido
(polling) e gera o QR em até ~4s.
