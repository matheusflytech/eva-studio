# App de disparos (clone enxuto do Eva) — design

Data: 13/11/2026. Nome do app: a definir (logo vem depois); no código, `NEXT_PUBLIC_APP_NAME` (padrão "Disparos").

## Objetivo

Um segundo app, com a cara do Eva, só para: agente de IA, atendimento (conversas), disparo pelo WhatsApp não oficial (QR/Baileys) para contato e grupo, contatos (importar/exportar), saber quem recebeu e quem não recebeu (com o motivo, exportável), abrir a conversa de quem recebeu, imagem/link/opções no disparo e um dashboard só de disparos. Site responsivo: no celular segue o formato da referência (saudação grande, card de destaque, ações grandes, cards arredondados com barra de progresso).

## Decisões (com o usuário)

- **Mesmo código e mesmo banco do Eva**, publicado como outro projeto na Vercel. O modo vem de `NEXT_PUBLIC_APP_VARIANT=disparos`. O worker do QR é o mesmo (um worker por banco).
- **Clientes, cada um no seu contrato** (Organization). Mesma autenticação (Supabase).
- **Visual do Eva** (tokens, vidro, orbe). Só o menu e a tela inicial mudam.
- **Anti-ban** já no ar (PR #100): 1 envio por chip a cada 8–20 s, 200 por chip/dia.
- **Botão**: pelo QR, botão não é confiável; o disparo usa opções numeradas no texto ("Responda 1, 2 ou 3").
- **Salvy** (compra/ativação de linha pela API v3): fase 2, fora deste spec.

## Unidades

1. **Modo do app** — `src/lib/app-variant.ts` (`APP_VARIANT`, `ehAppDeDisparos`, `NOME_DO_APP`). `navegacao.ts` devolve o menu do modo: Início, Disparos, Conversas, Contatos, Agentes, Chips. O `proxy.ts` manda qualquer outra seção do contrato para `/home` nesse modo. A marca no topo usa `NOME_DO_APP`.
2. **Dashboard de disparos** — `GET /api/broadcasts/overview` (contrato todo): hoje (enviados, entregues, lidos, falhas, na fila), uso de cada chip hoje vs limite, últimos disparos com progresso. Tela `DashboardDeDisparos` (é o `/home` no modo disparos), mobile-first.
3. **Destinatários do disparo** — `GET /api/agents/[agentId]/broadcasts/[broadcastId]/recipients?status=&format=csv`: número, situação (na fila / enviando / enviado / entregue / lido / falhou), motivo, horários e `conversationId`. Na tela: lista filtrável, "Exportar" (CSV, padrão = só falhas quando filtrado) e "Abrir conversa".
4. **Novo disparo melhorado** —
   - Imagem: upload pelo `/api/conversations/upload`; o disparo guarda `mediaPath/mediaType/mediaMime/mediaName` (colunas novas, SQL `2026-11-13-broadcast-media.sql`, só aditivo) e o runner passa para a fila.
   - Link: vai no texto (clicável no WhatsApp).
   - Opções: campo de até 3 opções, anexadas ao texto como lista numerada.
   - Lista manual: colar ou **subir CSV/TXT** (pega a coluna de telefone ou o primeiro número da linha).
   - **Grupos**: escolher grupos do chip (tabela `WhatsAppGroup`); entram na lista como jid `@g.us`.
   - **Dividir entre chips**: escolher vários agentes/chips; a tela cria um disparo por chip com a lista dividida em partes iguais.

## Erros

- Sem a SQL rodada, criar disparo com imagem responde 409 com aviso; sem imagem segue igual.
- Motivos de falha legíveis vêm do worker ("Número sem WhatsApp", "WhatsApp não conectado (o chip caiu…)", "Número inválido") e do runner.
- Item parado pelo limite diário aparece como "Na fila (limite diário do chip)".

## Testes

Vitest para: modo do app (menu e seções permitidas), CSV/opções/divisão de lista (funções puras), rota de destinatários (status e CSV), overview (agregação). Verificação no navegador no celular (375 px) e no computador.

## Fora do escopo

Integração Salvy, construtor de agente simplificado (usa o do Eva), calendário, CRM (negócios, tarefas, relatórios, automações).
