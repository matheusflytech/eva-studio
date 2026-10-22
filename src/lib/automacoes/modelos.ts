import { VERSAO_DO_ESQUEMA, type Definicao, type No, type Objeto } from "./tipos";

// ---------------------------------------------------------------------------
// Modelos prontos da galeria (catálogo P0 para vendas no Brasil, WhatsApp
// primeiro). O que depende do contrato (etapa, pessoas, modelo aprovado, URL)
// fica vazio de propósito: vira pendência no editor e a automação não publica
// até a pessoa escolher. Nada de "etapa de exemplo" que dispara errado.
// ---------------------------------------------------------------------------

export interface ModeloDeAutomacao {
  id: string;
  nome: string;
  descricao: string;
  categoria: "Leads" | "Funil" | "Pós-venda" | "Relacionamento" | "Atendimento";
  objeto: Objeto;
  /** Gatilho de relógio: entrar sempre (com "uma vez" o registro só entra na primeira). */
  reinscricao: "uma_vez" | "sempre";
  definicao: () => Definicao;
}

function def(objeto: Objeto, gatilho: Definicao["gatilho"], nos: No[]): Definicao {
  return { versaoEsquema: VERSAO_DO_ESQUEMA, objeto, gatilho, inicio: nos[0]?.id ?? null, nos: Object.fromEntries(nos.map((n) => [n.id, n])) };
}

const acao = (id: string, tipo: string, config: Record<string, unknown>, proximo: string | null = null, rotulo?: string): No => ({
  id,
  tipo: "acao",
  acao: tipo,
  config,
  proximo,
  ...(rotulo ? { rotulo } : {}),
});

export const MODELOS: ModeloDeAutomacao[] = [
  {
    id: "lead-whatsapp",
    nome: "Lead novo no WhatsApp",
    descricao: "Primeira mensagem de uma conversa: distribui em rodízio, abre o negócio e avisa quem pegou.",
    categoria: "Leads",
    objeto: "conversation",
    reinscricao: "uma_vez",
    definicao: () =>
      def("conversation", { tipo: "message.received", config: { modo: "primeira", intervalo_min: 60 } }, [
        acao("n1", "owner.assign", { modo: "rodizio", usuarios: [] }, "n2"),
        acao("n2", "deal.create", { nome: "{{contato.name | padrao:\"Lead do WhatsApp\"}}", etapa: "", se_ja_tem: "pular" }, "n3"),
        acao("n3", "team.notify", { para: "responsavel", mensagem: "Lead novo no WhatsApp: {{contato.name | padrao:\"sem nome\"}}. Responda em até 5 minutos." }),
      ]),
  },
  {
    id: "proposta-sem-resposta",
    nome: "Proposta sem resposta",
    descricao: "Negócio entra em Proposta: espera o cliente por 2 dias úteis; sem resposta, manda o modelo e cria a tarefa de ligar.",
    categoria: "Funil",
    objeto: "deal",
    reinscricao: "sempre",
    definicao: () =>
      def("deal", { tipo: "deal.stage_entered", config: { etapa: "", quando: "ambos" } }, [
        { id: "n1", tipo: "esperar_evento", evento: "message.received", prazo: { quantidade: 2, unidade: "dias_uteis" }, aconteceu: "n4", esgotou: "n2" },
        acao("n2", "whatsapp.send", { agente: "", modo: "modelo", modelo: "" }, "n3"),
        acao("n3", "task.create", { texto: "Ligar para {{contato.name | primeiro_nome}} sobre a proposta", tipo_tarefa: "ligar", prazo: 1, unidade: "dias_uteis", para: "responsavel" }),
        acao("n4", "note.create", { texto: "O cliente respondeu depois da proposta." }),
      ]),
  },
  {
    id: "negocio-parado",
    nome: "Negócio parado",
    descricao: "Sem movimento há 7 dias: cria a tarefa de retomar; se ninguém fizer em 2 dias úteis, avisa o gestor.",
    categoria: "Funil",
    objeto: "deal",
    reinscricao: "sempre",
    definicao: () =>
      def("deal", { tipo: "deal.stale", config: { dias: 7 } }, [
        acao("n1", "task.create", { texto: "Retomar o negócio {{registro.name}}", tipo_tarefa: "ligar", prazo: 1, unidade: "dias_uteis", para: "responsavel" }, "n2"),
        { id: "n2", tipo: "espera", config: { modo: "duracao", quantidade: 2, unidade: "dias_uteis" }, proximo: "n3" },
        { id: "n3", tipo: "condicao", regra: { grupos: [{ condicoes: [{ campo: "registro.tem_tarefa_aberta", operador: "verdadeiro" }] }] }, sim: "n4", nao: null },
        acao("n4", "team.notify", { para: "usuarios", usuarios: [], mensagem: "O negócio {{registro.name}} segue parado e a tarefa de retomar não foi feita." }),
      ]),
  },
  {
    id: "tarefa-por-etapa",
    nome: "Tarefa por etapa (playbook)",
    descricao: "Cada negócio que entra na etapa ganha a tarefa certa, com prazo em dias úteis.",
    categoria: "Funil",
    objeto: "deal",
    reinscricao: "sempre",
    definicao: () =>
      def("deal", { tipo: "deal.stage_entered", config: { etapa: "", quando: "ambos" } }, [
        acao("n1", "task.create", { texto: "Próximo passo de {{registro.name}}", tipo_tarefa: "afazer", prazo: 1, unidade: "dias_uteis", para: "responsavel" }),
      ]),
  },
  {
    id: "ganho-pos-venda",
    nome: "Ganho: pós-venda",
    descricao: "Negócio ganho: fecha as tarefas abertas, manda para o n8n (ERP) e cria a tarefa de onboarding.",
    categoria: "Pós-venda",
    objeto: "deal",
    reinscricao: "uma_vez",
    definicao: () =>
      def("deal", { tipo: "deal.won", config: {} }, [
        acao("n1", "task.complete_open", {}, "n2"),
        acao("n2", "n8n.webhook", { url: "", extra: "{}" }, "n3"),
        acao("n3", "task.create", { texto: "Onboarding de {{contato.name | padrao:\"cliente\"}}", tipo_tarefa: "reuniao", prazo: 2, unidade: "dias_uteis", para: "responsavel" }),
      ]),
  },
  {
    id: "perdido-preco",
    nome: "Perdido por preço: nutrição",
    descricao: "Perdido com o motivo preço: entra numa régua de nutrição para voltar a conversar mais tarde.",
    categoria: "Relacionamento",
    objeto: "deal",
    reinscricao: "uma_vez",
    definicao: () => def("deal", { tipo: "deal.lost", config: { motivo: "preço" } }, [acao("n1", "sequence.enroll", { regua: "" })]),
  },
  {
    id: "aniversario",
    nome: "Aniversário do contato",
    descricao: "No dia do aniversário, às 9h, manda os parabéns pelo WhatsApp (modelo aprovado).",
    categoria: "Relacionamento",
    objeto: "contact",
    reinscricao: "sempre",
    definicao: () =>
      def("contact", { tipo: "contact.date_relative", config: { campo: "", dias: 0, hora: "09:00", todo_ano: true } }, [
        acao("n1", "whatsapp.send", { agente: "", modo: "modelo", modelo: "" }),
      ]),
  },
  {
    id: "sla-atendente",
    nome: "SLA: cliente esperando atendente",
    descricao: "O agente passou para a equipe e ninguém respondeu em 5 minutos: avisa quem cuida da fila.",
    categoria: "Atendimento",
    objeto: "conversation",
    reinscricao: "sempre",
    definicao: () =>
      def("conversation", { tipo: "conversation.waiting_human", config: { minutos: 5 } }, [
        acao("n1", "team.notify", { para: "usuarios", usuarios: [], mensagem: "{{contato.name | padrao:\"Um cliente\"}} está esperando atendimento há 5 minutos." }),
      ]),
  },
  {
    id: "lead-externo",
    nome: "Lead de formulário ou anúncio",
    descricao: "Virou lead: distribui em rodízio e cria a tarefa de ligar na hora.",
    categoria: "Leads",
    objeto: "contact",
    reinscricao: "uma_vez",
    definicao: () =>
      def("contact", { tipo: "lead.captured", config: {} }, [
        acao("n1", "owner.assign", { modo: "rodizio", usuarios: [], so_se_vazio: true }, "n2"),
        acao("n2", "task.create", { texto: "Ligar para o lead {{registro.name | padrao:\"novo\"}}", tipo_tarefa: "ligar", prazo: 1, unidade: "horas", para: "responsavel" }),
      ]),
  },
];

export const modeloPorId = (id: string) => MODELOS.find((m) => m.id === id);
