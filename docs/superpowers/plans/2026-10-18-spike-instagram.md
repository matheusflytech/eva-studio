# Spike Instagram — story, host do token, versão da Graph

**Status:** PENDENTE — sem conta de teste em 18/10/2026. As fixtures em `src/test/fixtures/meta/ig-*.json` seguem o formato **documentado** pela Meta, não payloads capturados. Repetir antes do merge (Task 3 do plano `2026-10-18-fase-0-1-testes-e-gatilhos.md`).

| Pergunta | Resposta | Impacto |
|---|---|---|
| Reação com emoji a story chega como `message.text` = emoji + `reply_to.story`? | a confirmar | Se não chegar, a opção "também responder reações" não funciona; documentar na tela |
| Formato real de `story_mention` (anexo em `message.attachments`)? | a confirmar | `classifyInstagramMessage` |
| Envio com token do Instagram Login funciona em `graph.facebook.com`? | a confirmar | Se não: aplicar Task 4 Step 5 e trocar URLs de comentário (Task 9 Step 5) |
| `GET /{ig-id}/stories` funciona com token do Instagram Login? | a confirmar | Se não: tela de gatilho só aceita ID manual |
| Graph `v21.0` ainda responde sem aviso? | a confirmar | Se não: subir `GRAPH_VERSION` em `meta-graph.ts` |
