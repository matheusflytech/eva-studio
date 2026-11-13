# Disparo: tela mais limpa — plano

Branch `feat/disparo-ux-limpa`, só local (sem PR até revisarmos juntos).
Tudo vale só para o app Disparo (`ehAppDeDisparos`), exceto 0, 4 e 5, que melhoram os dois sites.

## 0. Menu lateral (trilho)
- Causa da abertura "de estalo": `.vidro` (CSS fora de camada) apagava o `transition-[width]` do Tailwind.
- Transição da largura no próprio CSS: abre em 420 ms com 150 ms de respiro, fecha em 220 ms.
- Fundo quase sólido (94% do painel, desfoque 28 px); dicas repetidas removidas.

## 1. Caixa de entrada por chip
- No Disparo cada chip = um agente. Faixa de abas no topo da lista: "Todas" + uma aba por chip (nome do agente + final do número).
- Esconder filtros que não servem ao Disparo (canal, "minhas", testes).

## 2. Sem negócios, notas internas, tarefas e etiquetas
- Painel lateral da conversa: fica Contato + **Mensagens agendadas** (lista por dia/horário, agendar nova, cancelar).
- Compositor: sem modo "Nota interna".
- Página do contato: sem etiquetas, tarefas, negócios, notas.
- Etiquetas continuam por baixo como **listas** do disparo (a Lista Scudeler Interior é uma etiqueta): no Disparo aparecem só como "Lista" na escolha do público.

## 3. Agendamentos (estilo SendFlow)
- Nova aba no topo: **Agendamentos**, com duas abas internas: **Individual** e **Grupos**.
- Individual: mensagens agendadas para contatos (já existe `Broadcast kind=single`), agrupadas por dia.
- Grupos: mensagens agendadas para grupos do WhatsApp do chip (jid `@g.us`), mesma estrutura.
- Cada uma: chip, destino, dia/horário, texto (com mídia quando der), cancelar.

## 4. Áudio como gravado na hora
- Worker manda áudio com `ptt: true` (nota de voz) em `audio/ogg; codecs=opus`.
- Converte o que não for ogg/opus com ffmpeg (`ffmpeg-static`), senão o WhatsApp não toca.

## 5. Imagem abre no próprio app
- Clique na imagem abre visualizador em tela cheia (fecha com Esc, clique fora ou X), sem nova aba.

## 6. Celular + início mais limpo
- Barra de navegação embaixo no celular (Início, Disparos, Conversas, Agendamentos, Mais).
- Conversas no celular: lista ou conversa, uma de cada vez, com voltar.
- Início: cartão de enviados hoje, chips e últimos disparos; relatório completo só na aba Relatórios.
- Passar todas as telas em 375 px sem rolagem lateral.
