// Catálogo das fontes do Dashboard.
//
// Separado de `lib/server/analytics.ts` (que é server-only, porque toca o
// banco) para que a tela de ajuda possa listar as mesmas fontes sem duplicar
// a lista. Documentação que repete a fonte de verdade envelhece em silêncio.

// "especial": cartão da visão geral, com desenho próprio (dados de /api/dashboard/overview).
export type TipoDeFonte = "numero" | "serie" | "quebra" | "tabela" | "funil" | "especial";

export interface DefinicaoDeFonte {
  chave: string;
  rotulo: string;
  /** Uma linha explicando de onde o número sai, mostrada na hora de escolher. */
  explicacao: string;
  tipo: TipoDeFonte;
  /** Como formatar um `numero`. */
  formato?: "dinheiro" | "inteiro" | "porcento" | "dias";
  grupo: "Visão geral" | "Vendas" | "Funil" | "Atendimento";
  /**
   * Quais filtros globais do painel (funis, responsável) a fonte respeita.
   * "todos": os dois. "um-funil": responsável sim, mas o funil é um só (as
   * etapas são de um funil; com vários escolhidos, mostra o primeiro/padrão).
   * "nenhum": não é de negócio (atendimento), só o período vale.
   */
  filtros: "todos" | "um-funil" | "nenhum";
}

export const FONTES: DefinicaoDeFonte[] = [
  { chave: "visaoReceita", rotulo: "Receita", explicacao: "Negócios ganhos no período, somados, contra o período anterior de mesmo tamanho.", tipo: "especial", formato: "dinheiro", filtros: "todos", grupo: "Visão geral" },
  { chave: "visaoVendas", rotulo: "Vendas", explicacao: "Quantos negócios foram ganhos no período, contra o período anterior.", tipo: "especial", formato: "inteiro", filtros: "todos", grupo: "Visão geral" },
  { chave: "visaoConversas", rotulo: "Conversas", explicacao: "Conversas novas no período, contra o período anterior. O anel mostra quantas terminaram sem atendente.", tipo: "especial", formato: "inteiro", filtros: "nenhum", grupo: "Visão geral" },
  { chave: "visaoConversao", rotulo: "Conversão", explicacao: "Negócios ganhos sobre negócios criados no período, contra o período anterior.", tipo: "especial", formato: "porcento", filtros: "todos", grupo: "Visão geral" },
  { chave: "ritmo", rotulo: "Ritmo", explicacao: "Receita projetada até o fim do período contra a média dos 3 períodos anteriores. Só para períodos que incluem hoje.", tipo: "especial", filtros: "todos", grupo: "Visão geral" },
  { chave: "receitaPorMes", rotulo: "Receita por mês", explicacao: "Receita de cada mês desde o começo do ano passado, com a média.", tipo: "especial", filtros: "todos", grupo: "Visão geral" },
  { chave: "mapaDeHorarios", rotulo: "Mapa de horários", explicacao: "Mensagens de clientes no período, por dia da semana e bloco de 2 horas.", tipo: "especial", filtros: "nenhum", grupo: "Visão geral" },

  { chave: "vendas", rotulo: "Vendas fechadas", explicacao: "Negócios que entraram numa etapa de ganho no período.", tipo: "numero", formato: "inteiro", filtros: "todos", grupo: "Vendas" },
  { chave: "receita", rotulo: "Receita", explicacao: "Soma do valor dos negócios ganhos no período.", tipo: "numero", formato: "dinheiro", filtros: "todos", grupo: "Vendas" },
  { chave: "ticket", rotulo: "Ticket médio", explicacao: "Receita dividida pelo número de vendas.", tipo: "numero", formato: "dinheiro", filtros: "todos", grupo: "Vendas" },
  { chave: "vendasHoje", rotulo: "Vendas de hoje", explicacao: "Negócios ganhos desde a meia-noite.", tipo: "numero", formato: "inteiro", filtros: "todos", grupo: "Vendas" },
  { chave: "receitaHoje", rotulo: "Receita de hoje", explicacao: "Valor fechado desde a meia-noite.", tipo: "numero", formato: "dinheiro", filtros: "todos", grupo: "Vendas" },
  { chave: "conversao", rotulo: "Taxa de conversão", explicacao: "Dos negócios criados no período, quantos viraram venda.", tipo: "numero", formato: "porcento", filtros: "todos", grupo: "Vendas" },
  { chave: "receitaPorDia", rotulo: "Receita por dia", explicacao: "Quanto fechou em cada dia do período.", tipo: "serie", filtros: "todos", grupo: "Vendas" },
  { chave: "vendasRecentes", rotulo: "Últimas vendas", explicacao: "Lista dos negócios ganhos mais recentes.", tipo: "tabela", filtros: "todos", grupo: "Vendas" },

  { chave: "emAberto", rotulo: "Em aberto", explicacao: "Valor somado dos negócios que ainda não fecharam.", tipo: "numero", formato: "dinheiro", filtros: "todos", grupo: "Funil" },
  { chave: "emAbertoPonderado", rotulo: "Previsão ponderada", explicacao: "Em aberto, cada negócio multiplicado pela chance da etapa.", tipo: "numero", formato: "dinheiro", filtros: "todos", grupo: "Funil" },
  { chave: "negociosAbertos", rotulo: "Negócios abertos", explicacao: "Quantos negócios estão em andamento agora.", tipo: "numero", formato: "inteiro", filtros: "todos", grupo: "Funil" },
  { chave: "porEtapa", rotulo: "Onde o dinheiro está", explicacao: "Valor em aberto somado por etapa do funil.", tipo: "quebra", filtros: "todos", grupo: "Funil" },
  { chave: "porCanalVendas", rotulo: "Vendas por canal", explicacao: "Por qual canal chegou quem comprou.", tipo: "quebra", filtros: "todos", grupo: "Funil" },
  { chave: "funilConversao", rotulo: "Conversão do funil", explicacao: "Dos negócios criados no período, quantos chegaram em cada etapa.", tipo: "funil", filtros: "um-funil", grupo: "Funil" },
  { chave: "tempoPorEtapa", rotulo: "Dias em cada etapa", explicacao: "Mediana de dias que um negócio fica em cada etapa do funil.", tipo: "quebra", filtros: "um-funil", grupo: "Funil" },
  { chave: "negociosParados", rotulo: "Negócios parados", explicacao: "Abertos e sem atividade (nota, tarefa concluída, mensagem, edição) há mais que o prazo de parado da etapa (padrão 7 dias).", tipo: "tabela", filtros: "um-funil", grupo: "Funil" },
  { chave: "motivosDePerda", rotulo: "Motivos de perda", explicacao: "Por que os negócios perdidos no período foram perdidos.", tipo: "quebra", filtros: "um-funil", grupo: "Funil" },
  { chave: "taxaDeGanho", rotulo: "Taxa de ganho", explicacao: "Dos negócios fechados no período, quantos foram ganhos.", tipo: "numero", formato: "porcento", filtros: "um-funil", grupo: "Funil" },
  { chave: "cicloDeVenda", rotulo: "Ciclo de venda", explicacao: "Mediana de dias entre criar o negócio e ganhar.", tipo: "numero", formato: "dias", filtros: "um-funil", grupo: "Funil" },

  { chave: "conversas", rotulo: "Conversas", explicacao: "Atendimentos no período, sem contar testes.", tipo: "numero", formato: "inteiro", filtros: "nenhum", grupo: "Atendimento" },
  { chave: "autonomia", rotulo: "Resolvido pelo agente", explicacao: "Conversas que não precisaram de atendente humano.", tipo: "numero", formato: "porcento", filtros: "nenhum", grupo: "Atendimento" },
  { chave: "esperandoHumano", rotulo: "Esperando atendente", explicacao: "Conversas paradas aguardando uma pessoa agora.", tipo: "numero", formato: "inteiro", filtros: "nenhum", grupo: "Atendimento" },
  { chave: "mensagens", rotulo: "Mensagens recebidas", explicacao: "Mensagens que os contatos enviaram no período.", tipo: "numero", formato: "inteiro", filtros: "nenhum", grupo: "Atendimento" },
  { chave: "conversasPorHora", rotulo: "Horário de pico", explicacao: "Mensagens recebidas por hora, no fuso de São Paulo.", tipo: "serie", filtros: "nenhum", grupo: "Atendimento" },
  { chave: "porCanalConversas", rotulo: "Conversas por canal", explicacao: "De onde vêm os atendimentos.", tipo: "quebra", filtros: "nenhum", grupo: "Atendimento" },
];

export const FONTE_POR_CHAVE = new Map(FONTES.map((f) => [f.chave, f]));
