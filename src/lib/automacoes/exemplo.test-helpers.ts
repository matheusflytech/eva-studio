import { aplicarTodas } from "./operacoes";
import { definicaoVazia, type Definicao } from "./tipos";

/** "Entrou em Proposta → espera 2 dias úteis → se ainda em Proposta: modelo + tarefa; senão: nota." */
export function exemploProposta(): Definicao {
  return aplicarTodas(definicaoVazia("deal"), [
    { op: "definir_gatilho", gatilho: { tipo: "deal.stage_entered", config: { etapa: "s_prop", quando: "ambos" } } },
    { op: "inserir", ponta: { de: "gatilho", saida: "proximo" }, no: { id: "espera", tipo: "espera", config: { modo: "duracao", quantidade: 2, unidade: "dias_uteis" }, proximo: null } },
    {
      op: "inserir",
      ponta: { de: "espera", saida: "proximo" },
      no: { id: "cond", tipo: "condicao", regra: { grupos: [{ condicoes: [{ campo: "registro.stage_id", operador: "igual", valor: "s_prop" }] }] }, sim: null, nao: null },
    },
    { op: "inserir", ponta: { de: "cond", saida: "sim" }, no: { id: "zap", tipo: "acao", acao: "whatsapp.send", config: { agente: "a1", modo: "modelo", modelo: "m1" }, proximo: null } },
    {
      op: "inserir",
      ponta: { de: "zap", saida: "proximo" },
      no: { id: "tarefa", tipo: "acao", acao: "task.create", config: { texto: "Ligar para {{contato.name | primeiro_nome}}", prazo: 1, unidade: "dias_uteis" }, proximo: null },
    },
    { op: "inserir", ponta: { de: "cond", saida: "nao" }, no: { id: "nota", tipo: "acao", acao: "note.create", config: { texto: "Saiu de Proposta antes do follow-up" }, proximo: null } },
  ]);
}
