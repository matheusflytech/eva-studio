// Catálogo das fontes do Dashboard.
//
// Separado de `lib/server/analytics.ts` (que é server-only, porque toca o
// banco) para que a tela de ajuda possa listar as mesmas fontes sem duplicar
// a lista. Documentação que repete a fonte de verdade envelhece em silêncio.

export type TipoDeFonte = "numero" | "serie" | "quebra" | "tabela";

export interface DefinicaoDeFonte {
  chave: string;
  rotulo: string;
  /** Uma linha explicando de onde o número sai, mostrada na hora de escolher. */
  explicacao: string;
  tipo: TipoDeFonte;
  /** Como formatar um `numero`. */
  formato?: "dinheiro" | "inteiro" | "porcento";
  grupo: "Vendas" | "Funil" | "Atendimento";
}

export const FONTES: DefinicaoDeFonte[] = [
  { chave: "vendas", rotulo: "Vendas fechadas", explicacao: "Negócios que entraram numa etapa de ganho no período.", tipo: "numero", formato: "inteiro", grupo: "Vendas" },
  { chave: "receita", rotulo: "Receita", explicacao: "Soma do valor dos negócios ganhos no período.", tipo: "numero", formato: "dinheiro", grupo: "Vendas" },
  { chave: "ticket", rotulo: "Ticket médio", explicacao: "Receita dividida pelo número de vendas.", tipo: "numero", formato: "dinheiro", grupo: "Vendas" },
  { chave: "vendasHoje", rotulo: "Vendas de hoje", explicacao: "Negócios ganhos desde a meia-noite.", tipo: "numero", formato: "inteiro", grupo: "Vendas" },
  { chave: "receitaHoje", rotulo: "Receita de hoje", explicacao: "Valor fechado desde a meia-noite.", tipo: "numero", formato: "dinheiro", grupo: "Vendas" },
  { chave: "conversao", rotulo: "Taxa de conversão", explicacao: "Dos negócios criados no período, quantos viraram venda.", tipo: "numero", formato: "porcento", grupo: "Vendas" },
  { chave: "receitaPorDia", rotulo: "Receita por dia", explicacao: "Quanto fechou em cada dia do período.", tipo: "serie", grupo: "Vendas" },
  { chave: "vendasRecentes", rotulo: "Últimas vendas", explicacao: "Lista dos negócios ganhos mais recentes.", tipo: "tabela", grupo: "Vendas" },

  { chave: "emAberto", rotulo: "Em aberto", explicacao: "Valor somado dos negócios que ainda não fecharam.", tipo: "numero", formato: "dinheiro", grupo: "Funil" },
  { chave: "emAbertoPonderado", rotulo: "Previsão ponderada", explicacao: "Em aberto, cada negócio multiplicado pela chance da etapa.", tipo: "numero", formato: "dinheiro", grupo: "Funil" },
  { chave: "negociosAbertos", rotulo: "Negócios abertos", explicacao: "Quantos negócios estão em andamento agora.", tipo: "numero", formato: "inteiro", grupo: "Funil" },
  { chave: "porEtapa", rotulo: "Onde o dinheiro está", explicacao: "Valor em aberto somado por etapa do funil.", tipo: "quebra", grupo: "Funil" },
  { chave: "porCanalVendas", rotulo: "Vendas por canal", explicacao: "Por qual canal chegou quem comprou.", tipo: "quebra", grupo: "Funil" },

  { chave: "conversas", rotulo: "Conversas", explicacao: "Atendimentos no período, sem contar testes.", tipo: "numero", formato: "inteiro", grupo: "Atendimento" },
  { chave: "autonomia", rotulo: "Resolvido pelo agente", explicacao: "Conversas que não precisaram de atendente humano.", tipo: "numero", formato: "porcento", grupo: "Atendimento" },
  { chave: "esperandoHumano", rotulo: "Esperando atendente", explicacao: "Conversas paradas aguardando uma pessoa agora.", tipo: "numero", formato: "inteiro", grupo: "Atendimento" },
  { chave: "mensagens", rotulo: "Mensagens recebidas", explicacao: "Mensagens que os contatos enviaram no período.", tipo: "numero", formato: "inteiro", grupo: "Atendimento" },
  { chave: "conversasPorHora", rotulo: "Horário de pico", explicacao: "Mensagens recebidas por hora, no fuso de São Paulo.", tipo: "serie", grupo: "Atendimento" },
  { chave: "porCanalConversas", rotulo: "Conversas por canal", explicacao: "De onde vêm os atendimentos.", tipo: "quebra", grupo: "Atendimento" },
];

export const FONTE_POR_CHAVE = new Map(FONTES.map((f) => [f.chave, f]));
