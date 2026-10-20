# Plano: tema escuro, builder, agentes de IA, integrações, e-mail, n8n e Cloudflare

Data: 2026-10-20. Pedido do Alfredo, a partir do mapa do código (agente de
leitura, mesmo dia). Produto: Eva Studio. Tudo local até ele autorizar PR;
banco só aditivo e com OK.

## Diagnóstico (resumo do mapa)

- **Builder:** saídas dos blocos "Responder com IA" e "Enviar para meu fluxo"
  nunca são seguidas; "+" no meio da ligação oferece ferramentas (quebra o
  fluxo) e usa nomes antigos; adicionar depois de Condição/menu cria ligação
  sem `sourceHandle` (a conversa morre); "Sim/Não" e opções de menu não ficam
  alinhados aos pontos; ligações sem rótulo; validação não pega ramo faltando;
  fluxo vindo da API v1 empilha tudo em (0,0); IA e modelos montam na vertical
  com portas horizontais; salvamento interno não valida; cores fixas por bloco
  (Início invisível no claro); exemplo com menu sem opções.
- **IA do agente:** o bloco de IA ignora instruções/tom/"nunca deve fazer" do
  agente; provedor e modelo só no bloco; sem reserva de chave; tela de
  Integrações só oferece Groq e Resend; "Habilidades", "Ferramentas do n8n" e
  "Canal principal" são decorativos.
- **Canais:** todos dentro da aba Canais de cada agente; nenhuma conexão de BM
  no nível do contrato; nenhum logo de marca.
- **E-mail:** só o bloco "Enviar e-mail" (Resend, texto livre, um
  destinatário); nada em réguas, disparos, modelos, domínio.
- **n8n:** só o webhook de saída do agente; o "webhook de entrada" mostrado na
  tela é falso; sem eventos do CRM, sem nó, sem tela.
- **Tema:** existe claro/escuro no design system, mas não há onde trocar.

## Frentes (uma por vez, com a skill certa)

| # | Frente | Entrega | Skills |
|---|---|---|---|
| F1 | **Tema escuro** | Troca de tema em Configurações → Sua conta e no rodapé do menu; builder e blocos com tokens nos dois temas (canvas escuro no tema escuro; opção "canvas sempre escuro") | crm-design-system, shadcn |
| F2 | **Builder confiável e organizado** | Corrigir os bugs acima; rótulos de saída ao lado de cada ponto e nas ligações; menu "+" só com blocos válidos; validação de ramos/opções/ids; **auto-layout esquerda→direita** com altura real dos cartões (dagre ou elk), aplicado ao salvar pela API v1, pela IA e nos modelos; salvamento interno validado; limpar código morto e campos decorativos | crm-design-system, shadcn |
| F3 | **Central de IA** | Várias chaves por contrato (todos os provedores do catálogo), **uma conexão única** para os agentes com ordem de preferência e **reserva automática** (falha, lentidão, limite); modelos: GPT-5.6 Luna (id configurável), Gemini 2.0 Flash e 2.5 Flash, Grok, Claude Haiku, além dos atuais; login no provedor onde existir (OpenRouter tem OAuth PKCE; os demais por chave), uso e custo por chave/agente com limite; criação de agente em etapas com modelo no agente e o bloco de IA usando as instruções do agente | crm-ai-copilot, shadcn |
| F4 | **Integrações em aba própria** | Configurações → Integrações: conexão do BM/Meta, WhatsApp oficial e QR, Instagram, Messenger, Telegram, TikTok, widget, e-mail, n8n, chaves de IA, MCP — no nível do contrato, com **logos das marcas**; o agente só escolhe quais canais usa; catálogo de integrações "nativas" | crm-whatsapp-channel, crm-brazil-integrations, shadcn |
| F5 | **E-mail automático** | Resend (gratuito até 3 mil/mês, escala) com verificação de domínio, modelos com variáveis, passo de e-mail nas réguas e no fluxo, disparo de e-mail, eventos de entrega | crm-sequences, crm-content-library, crm-broadcasts |
| F6 | **n8n fácil** | Webhooks de saída do CRM (API-6: catálogo de eventos, HMAC, tentativas, log, reenviar); tela n8n com a logo, passo a passo e testes; webhook de entrada de verdade (substitui o falso); pacote do nó da Eva para o n8n (community node) e modelos de workflow | crm-n8n-integration, crm-api-webhooks |
| F7 | **Cloudflare** | Documento de arquitetura escalável (Workers, Queues, KV/D1/R2, Durable Objects para sessões, custos e limites) e a primeira peça: entrada de webhooks (Meta, Telegram, TikTok) num Worker com fila, entregando ao app | crm-whatsapp-channel, crm-api-webhooks |

Ordem: F1 → F2 → F3 → F4 → F5 → F6, com F7 em paralelo (pasta própria).
