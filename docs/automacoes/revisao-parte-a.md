# Revisão da parte A das automações

Gerado do código (`src/lib/automacoes/catalogo.ts`). `*` = obrigatório.

## Gatilhos (34)

### Negócios (13)

| Gatilho | Tipo | Como dispara | Configuração | Frase de exemplo |
|---|---|---|---|---|
| Negócio criado | `deal.created` | evento deal.created | Só do funil | Quando um negócio for criado |
| Entrou na etapa | `deal.stage_entered` | evento deal.created, deal.stage_changed | Etapa *; Vale quando [padrão: "ambos"] | Quando um negócio entrar em … |
| Saiu da etapa | `deal.stage_left` | evento deal.stage_changed | Etapa * | Quando um negócio sair de … |
| Negócio ganho | `deal.won` | evento deal.won | Só do funil | Quando um negócio for ganho |
| Negócio perdido | `deal.lost` | evento deal.lost | Só do funil; Motivo contém (opcional) | Quando um negócio for perdido |
| Negócio reaberto | `deal.reopened` | evento deal.reopened | Só do funil | Quando um negócio for reaberto |
| Parado há dias | `deal.stale` | varredura | Dias parado * [padrão: 7]; Só na etapa | Quando um negócio ficar parado ? dias |
| Campo alterado | `deal.field_changed` | evento deal.updated | Campo *; Passou a ser (opcional) | Quando … mudar |
| Responsável alterado | `deal.owner_changed` | evento deal.owner_changed | — | Quando o responsável de um negócio mudar |
| Data de um campo | `deal.date_relative` | varredura | Campo de data *; Dias (negativo = antes) * [padrão: 0]; Hora [padrão: "09:00"]; Repetir todo ano (aniversário) [padrão: false] | No dia de … |
| Agendado | `deal.schedule` | varredura | Frequência [padrão: "diaria"]; Dia da semana (se frequencia = semanal) [padrão: "1"]; Hora [padrão: "09:00"]; Só do funil; Só na etapa | Todo dia às 09:00, para os negócios abertos |
| Webhook de entrada | `deal.webhook` | webhook | — | Quando chegar uma chamada na URL desta automação |
| Manual | `deal.manual` | manual | — | Quando alguém acionar à mão no negócio |

### Contatos (9)

| Gatilho | Tipo | Como dispara | Configuração | Frase de exemplo |
|---|---|---|---|---|
| Contato criado | `contact.created` | evento contact.created | — | Quando um contato for criado |
| Campo alterado | `contact.field_changed` | evento contact.updated | Campo *; Passou a ser (opcional) | Quando … mudar |
| Etiqueta adicionada | `contact.tag_added` | evento contact.tag_added | Etiqueta * | Quando um contato ganhar a etiqueta … |
| Etiqueta removida | `contact.tag_removed` | evento contact.tag_removed | Etiqueta * | Quando um contato perder a etiqueta … |
| Virou lead | `lead.captured` | evento lead.captured | — | Quando um contato virar lead |
| Data de um campo | `contact.date_relative` | varredura | Campo de data *; Dias (negativo = antes) * [padrão: 0]; Hora [padrão: "09:00"]; Repetir todo ano (aniversário) [padrão: false] | No dia de … |
| Agendado | `contact.schedule` | varredura | Frequência [padrão: "diaria"]; Dia da semana (se frequencia = semanal) [padrão: "1"]; Hora [padrão: "09:00"]; Segmento * | Todo dia às 09:00, para o segmento … |
| Webhook de entrada | `contact.webhook` | webhook | — | Quando chegar uma chamada na URL desta automação |
| Manual | `contact.manual` | manual | — | Quando alguém acionar à mão no contato |

### Empresas (5)

| Gatilho | Tipo | Como dispara | Configuração | Frase de exemplo |
|---|---|---|---|---|
| Empresa criada | `company.created` | evento company.created | — | Quando uma empresa for criada |
| Campo alterado | `company.field_changed` | evento company.updated | Campo *; Passou a ser (opcional) | Quando … mudar |
| Data de um campo | `company.date_relative` | varredura | Campo de data *; Dias (negativo = antes) * [padrão: 0]; Hora [padrão: "09:00"]; Repetir todo ano (aniversário) [padrão: false] | No dia de … |
| Webhook de entrada | `company.webhook` | webhook | — | Quando chegar uma chamada na URL desta automação |
| Manual | `company.manual` | manual | — | Quando alguém acionar à mão na empresa |

### Tarefas (4)

| Gatilho | Tipo | Como dispara | Configuração | Frase de exemplo |
|---|---|---|---|---|
| Tarefa criada | `task.created` | evento task.created | Só do tipo | Quando uma tarefa for criada |
| Tarefa concluída | `task.completed` | evento task.completed | Só do tipo | Quando uma tarefa for concluída |
| Tarefa atrasada | `task.overdue` | varredura | Horas de atraso [padrão: 0] | Quando uma tarefa passar do prazo |
| Manual | `task.manual` | manual | — | Quando alguém acionar à mão na tarefa |

### Conversas (3)

| Gatilho | Tipo | Como dispara | Configuração | Frase de exemplo |
|---|---|---|---|---|
| Mensagem recebida | `message.received` | evento message.received | Qual mensagem [padrão: "primeira"]; Palavras (separadas por vírgula) * (se modo = contem); Só do canal; Não repetir por (min) [padrão: 60] | Quando chegar a primeira mensagem de uma conversa |
| Cliente sem responder | `conversation.no_reply` | varredura | Horas sem resposta * [padrão: 24]; Só do canal | Quando o cliente ficar ? horas sem responder |
| Aguardando atendente | `conversation.waiting_human` | varredura | Minutos esperando * [padrão: 5] | Quando uma conversa esperar atendente por ? minutos |

## Ações (20)

### registro (9)

| Ação | Tipo | Vale para | Efeito | Fala com o cliente | Configuração |
|---|---|---|---|---|---|
| Atualizar campos | `record.update_fields` | negócio, contato, empresa, tarefa | interno | não | Campos * |
| Mover de etapa | `deal.move_stage` | negócio | interno | não | Etapa * |
| Marcar como ganho | `deal.mark_won` | negócio | interno | não | — |
| Marcar como perdido | `deal.mark_lost` | negócio | interno | não | Motivo * |
| Criar negócio | `deal.create` | negócio, contato, empresa, conversa | interno | não | Nome do negócio * [padrão: "{{contato.name}}"]; Etapa *; Valor (centavos); Se já tem negócio aberto [padrão: "pular"] |
| Criar ou atualizar contato | `contact.upsert` | negócio, empresa, conversa | interno | não | Nome; E-mail; Telefone |
| Adicionar etiqueta | `contact.add_tag` | negócio, contato, conversa | interno | não | Etiqueta * |
| Remover etiqueta | `contact.remove_tag` | negócio, contato, conversa | interno | não | Etiqueta * |
| Criar nota | `note.create` | negócio, contato, empresa, conversa | interno | não | Texto * |

### pessoas (4)

| Ação | Tipo | Vale para | Efeito | Fala com o cliente | Configuração |
|---|---|---|---|---|---|
| Atribuir responsável | `owner.assign` | negócio, contato, empresa, conversa | interno | não | Como [padrão: "rodizio"]; Pessoa * (se modo = fixo); Pessoas * (se modo = rodizio); Percentual por pessoa (opcional) (se modo = rodizio); Entre * (se modo = menos_carga); Só se ainda não tiver responsável [padrão: false] |
| Criar tarefa | `task.create` | negócio, contato, empresa, conversa | interno | não | Tarefa *; Tipo [padrão: "fazer"]; Prazo [padrão: 1]; Em [padrão: "dias_uteis"]; Para [padrão: "responsavel"]; Pessoa * (se para = usuario) |
| Concluir tarefas abertas | `task.complete_open` | negócio, contato | interno | não | — |
| Avisar a equipe | `team.notify` | negócio, contato, empresa, tarefa, conversa | interno | não | Para [padrão: "responsavel"]; Pessoas * (se para = usuarios); Mensagem *; Mandar também por e-mail [padrão: false] |

### cliente (5)

| Ação | Tipo | Vale para | Efeito | Fala com o cliente | Configuração |
|---|---|---|---|---|---|
| Mandar WhatsApp | `whatsapp.send` | negócio, contato, conversa | externo | sim | Agente que manda *; Canal; Mensagem [padrão: "texto"]; Texto * (se modo = texto); Modelo * (se modo = modelo); Se a janela de 24h estiver fechada (se modo = texto) [padrão: "pular"] |
| Mandar e-mail | `email.send` | negócio, contato, conversa | externo | sim | Modelo de e-mail * |
| Inscrever na régua | `sequence.enroll` | negócio, contato, conversa | interno | não | Régua * |
| Tirar da régua | `sequence.remove` | negócio, contato, conversa | interno | não | Régua |
| Passar para atendente | `conversation.handoff` | conversa, contato, negócio | interno | não | Para (opcional) |

### integracao (2)

| Ação | Tipo | Vale para | Efeito | Fala com o cliente | Configuração |
|---|---|---|---|---|---|
| Enviar para o n8n | `n8n.webhook` | negócio, contato, empresa, tarefa, conversa | externo | não | URL (Production URL do nó Webhook) *; Dados extras (JSON, aceita variáveis) |
| Chamar uma API | `http.request` | negócio, contato, empresa, tarefa, conversa | externo | não | Método [padrão: "POST"]; URL *; Cabeçalhos (JSON); Corpo |

## Campos que as condições enxergam

- **Negócios:** Nome (`registro.name`, texto); Valor (centavos) (`registro.amount_cents`, numero); Funil (`registro.pipeline_id`, funil); Etapa (`registro.stage_id`, etapa); Situação (open, won, lost) (`registro.status`, texto); Responsável (`registro.owner_id`, usuario); Motivo da perda (`registro.lost_reason`, texto); Previsão de fechamento (`registro.expected_closing_at`, data); Criado em (`registro.created_at`, data); Tem tarefa aberta (`registro.tem_tarefa_aberta`, booleano); Nome (`contato.name`, texto); E-mail (`contato.email`, texto); Telefone (`contato.phone`, texto); Cargo (`contato.job_title`, texto); Etiquetas (`contato.tags`, tag); Responsável (`contato.owner_id`, usuario); Aceita mensagens (`contato.opt_in`, booleano); Etapa do lead (`contato.lead_stage`, texto); Origem (`contato.source`, texto); Criado em (`contato.created_at`, data); Nome da empresa (`empresa.name`, texto); CNPJ (`empresa.cnpj`, texto); É dia útil (`sistema.dia_util`, booleano); Em horário comercial (8h–20h) (`sistema.horario_comercial`, booleano); Dia da semana (0 = domingo) (`sistema.dia_semana`, numero); Hora (0–23) (`sistema.hora`, numero)
- **Contatos:** Nome (`registro.name`, texto); E-mail (`registro.email`, texto); Telefone (`registro.phone`, texto); Cargo (`registro.job_title`, texto); Etiquetas (`registro.tags`, tag); Responsável (`registro.owner_id`, usuario); Aceita mensagens (`registro.opt_in`, booleano); Etapa do lead (`registro.lead_stage`, texto); Origem (`registro.source`, texto); Criado em (`registro.created_at`, data); Tem negócio aberto (`registro.tem_negocio_aberto`, booleano); Janela de 24h aberta no WhatsApp (`registro.janela_aberta`, booleano); Nome da empresa (`empresa.name`, texto); É dia útil (`sistema.dia_util`, booleano); Em horário comercial (8h–20h) (`sistema.horario_comercial`, booleano); Dia da semana (0 = domingo) (`sistema.dia_semana`, numero); Hora (0–23) (`sistema.hora`, numero)
- **Empresas:** Nome (`registro.name`, texto); CNPJ (`registro.cnpj`, texto); Setor (`registro.sector`, texto); Cidade (`registro.city`, texto); UF (`registro.uf`, texto); Responsável (`registro.owner_id`, usuario); Criada em (`registro.created_at`, data); É dia útil (`sistema.dia_util`, booleano); Em horário comercial (8h–20h) (`sistema.horario_comercial`, booleano); Dia da semana (0 = domingo) (`sistema.dia_semana`, numero); Hora (0–23) (`sistema.hora`, numero)
- **Tarefas:** Texto (`registro.text`, texto); Tipo (`registro.type`, texto); Prazo (`registro.due_at`, data); Concluída (`registro.done`, booleano); Responsável (`registro.assigned_to_id`, usuario); É dia útil (`sistema.dia_util`, booleano); Em horário comercial (8h–20h) (`sistema.horario_comercial`, booleano); Dia da semana (0 = domingo) (`sistema.dia_semana`, numero); Hora (0–23) (`sistema.hora`, numero)
- **Conversas:** Canal (`registro.channel`, texto); Agente (`registro.agent_id`, texto); Situação (active, human, waiting_human...) (`registro.status`, texto); Janela de 24h aberta (`registro.janela_aberta`, booleano); Texto da mensagem que disparou (`gatilho.text`, texto); Nome (`contato.name`, texto); E-mail (`contato.email`, texto); Telefone (`contato.phone`, texto); Cargo (`contato.job_title`, texto); Etiquetas (`contato.tags`, tag); Responsável (`contato.owner_id`, usuario); Aceita mensagens (`contato.opt_in`, booleano); Etapa do lead (`contato.lead_stage`, texto); Origem (`contato.source`, texto); Criado em (`contato.created_at`, data); É dia útil (`sistema.dia_util`, booleano); Em horário comercial (8h–20h) (`sistema.horario_comercial`, booleano); Dia da semana (0 = domingo) (`sistema.dia_semana`, numero); Hora (0–23) (`sistema.hora`, numero)

## Exemplo: proposta sem resposta

Frase:

> Quando um negócio entrar em Proposta: esperar 2 dias úteis; se Etapa é Proposta, mandar o modelo lembrete_proposta no WhatsApp, criar a tarefa “Ligar para {{contato.name | primeiro_nom…” para daqui a 1 dia útil; senão, anotar “Saiu de Proposta antes do follow-up”.

Pendências:

- nenhuma

Definição guardada:

```json
{
  "versaoEsquema": 1,
  "objeto": "deal",
  "gatilho": {
    "tipo": "deal.stage_entered",
    "config": {
      "etapa": "s_prop",
      "quando": "ambos"
    }
  },
  "inicio": "espera",
  "nos": {
    "espera": {
      "id": "espera",
      "tipo": "espera",
      "config": {
        "modo": "duracao",
        "quantidade": 2,
        "unidade": "dias_uteis"
      },
      "proximo": "cond"
    },
    "cond": {
      "id": "cond",
      "tipo": "condicao",
      "regra": {
        "grupos": [
          {
            "condicoes": [
              {
                "campo": "registro.stage_id",
                "operador": "igual",
                "valor": "s_prop"
              }
            ]
          }
        ]
      },
      "sim": "zap",
      "nao": "nota"
    },
    "zap": {
      "id": "zap",
      "tipo": "acao",
      "acao": "whatsapp.send",
      "config": {
        "agente": "a1",
        "modo": "modelo",
        "modelo": "m1"
      },
      "proximo": "tarefa"
    },
    "tarefa": {
      "id": "tarefa",
      "tipo": "acao",
      "acao": "task.create",
      "config": {
        "texto": "Ligar para {{contato.name | primeiro_nome}}",
        "prazo": 1,
        "unidade": "dias_uteis"
      },
      "proximo": null
    },
    "nota": {
      "id": "nota",
      "tipo": "acao",
      "acao": "note.create",
      "config": {
        "texto": "Saiu de Proposta antes do follow-up"
      },
      "proximo": null
    }
  }
}
```
