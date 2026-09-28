# Eva Studio — worker de WhatsApp (Baileys)

Processo separado, sempre ligado — o Baileys mantém um socket aberto com o WhatsApp, o que não roda em função
serverless da Vercel. Este worker só precisa da mesma `DATABASE_URL` do app principal; toda a comunicação entre
o app e o worker acontece através das tabelas `eva_studio_whatsapp_connections` (o worker faz polling a cada
4s) — não existe API própria além de um health check em `/`.

## Deploy

Hoje roda no Render (plano grátis, mantido acordado por ping externo). O passo a passo vale igual
para Railway.

1. Novo projeto → Deploy from GitHub repo → aponte pra este repositório, **root directory: `worker`**
2. Variáveis de ambiente — as três são obrigatórias, o processo **encerra na partida** sem as duas últimas:
   - `DATABASE_URL` — a mesma da Vercel
   - `EVA_STUDIO_URL` — a URL pública do app (hoje `https://evapp.vercel.app`), sem barra no fim
   - `INTERNAL_API_SECRET` — **idêntico** ao configurado no projeto da Vercel; é o que autentica o worker
     nas rotas internas. Valores diferentes nos dois lados fazem tudo responder 401 em silêncio.
3. Start command já vem do `package.json` (`npm start` → `node index.js`)
4. Sem porta fixa necessária — o worker escuta na porta que o provedor injetar (Render e Railway fazem isso)

## O que o worker faz

- **Sessão do Baileys** por agente, com QR e reconexão (polling de 4s)
- **Fila de saída**: resposta de atendente e disparo por WhatsApp via QR
- **Esperas vencidas**: retoma conversa parada num bloco Esperar
- **Relógio do produto** (`tickScheduler`, a cada 60s): chama `/api/internal/scheduler` no app, que entrega
  os passos de sequência vencidos e os disparos agendados.

  **Desde 28/09/2026 este não é mais o relógio principal.** Ele virou reserva: o relógio de verdade é o
  `pg_cron` dentro do Postgres do Supabase (`prisma/relogio.sql`), que não depende de nenhum processo
  ficar acordado. Os dois batendo juntos não duplicam entrega — a rota tem trava de 45s
  (`tentarTravarRelogio` em `src/lib/server/heartbeat.ts`) e o segundo a chegar recebe
  `{skipped:true}` sem entregar nada.

  O motivo da troca: o worker no plano grátis do Render hiberna, precisa de ping externo pra acordar, e
  quando o deploy automático não dispara ele fica rodando código velho — foi exatamente o que aconteceu.
  Sequência parada em silêncio é o pior modo de falha que existe, porque ninguém percebe.

## Rodando local pra testar

```bash
cd worker
npm install
DATABASE_URL="postgresql://..." npm start
```

Depois é só clicar em "Conectar via QR code" na página do agente no Eva Studio — o worker detecta o pedido
(polling) e gera o QR em até ~4s.
