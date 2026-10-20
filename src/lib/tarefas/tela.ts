import type { DecisaoDoProximoPasso, OrigemDaTarefa, Prioridade, ResultadoDaTarefa, TipoDeTarefa } from "./tipos";
import type { FonteDoItem } from "./meu-dia";

// Formatos que as rotas de tarefas devolvem para as telas (lista, Meu dia,
// fila, ficha). Só tipos: a rota e a tela falam exatamente a mesma coisa.

export interface TarefaDaTela {
  id: string;
  /** Tipo já normalizado ("outro" antigo → "afazer"). */
  type: TipoDeTarefa;
  text: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  diaTodo: boolean;
  prioridade: Prioridade;
  origem: OrigemDaTarefa;
  duracaoMin: number;
  resultado: ResultadoDaTarefa | null;
  nota: string | null;
  decisao: DecisaoDoProximoPasso | null;
  adiada: number;
  overdue: boolean;
  contact: { id: string; name: string; phone: string; email: string } | null;
  /** Conversa de WhatsApp mais recente do contato (ação de 1 clique). */
  conversaId: string | null;
  deal: { id: string; name: string; amountCents: number; expectedClosingAt: string | null } | null;
  assignedTo: { id: string; name: string } | null;
}

export interface ContextoDoItem {
  contato: { id: string; nome: string; telefone: string; email: string } | null;
  conversaId: string | null;
  negocio: { id: string; nome: string; valorCents: number; etapa: string | null; previsao: string | null } | null;
  ultimaMensagem: { texto: string; em: string } | null;
}

export interface ItemDoDiaDaTela {
  id: string;
  fonte: FonteDoItem;
  tipo: TipoDeTarefa;
  titulo: string;
  dueAt: string | null;
  diaTodo: boolean;
  prioridade: Prioridade;
  score: number;
  duracaoMin: number;
  tarefa: TarefaDaTela | null;
  contexto: ContextoDoItem;
}

export interface MeuDiaDaTela {
  fixos: ItemDoDiaDaTela[];
  agora: ItemDoDiaDaTela[];
  provavelmenteAmanha: ItemDoDiaDaTela[];
  capacidade: { livres: number; planejados: number; excedentes: number; fixosMin: number };
  filas: { tipo: TipoDeTarefa; rotulo: string; ids: string[] }[];
  resumo: { texto: string; reunioes: number; tarefas: number; atrasadas: number; aguardandoResposta: number; leadsNovos: number; negociosEmRisco: number };
}
