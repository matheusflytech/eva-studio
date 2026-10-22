// Linha do tempo das fichas do negócio e do contato: o formato que as rotas
// /api/deals/[dealId]/linha-do-tempo e /api/contacts/[contactId]/linha-do-tempo
// devolvem e as funções puras que viram texto e grupos por dia na tela. Fica fora dos componentes para ser testado
// sem navegador e para a rota e a tela falarem exatamente o mesmo formato.

export type OrigemDoMovimento = "usuario" | "fluxo" | "api" | "importacao" | "backfill" | string;

interface Base {
  id: string;
  /** ISO. É o que ordena e agrupa por dia. */
  em: string;
}

/** Na ficha do contato, de qual negócio é o item (a do negócio não precisa). */
interface DoNegocio {
  negocio?: { id: string; nome: string };
}

export type ItemDaLinhaDoTempo =
  | (Base & DoNegocio & { tipo: "criado"; etapa: string | null })
  | (Base & { tipo: "contato_criado"; origem: string | null })
  | (Base & DoNegocio & {
      tipo: "etapa";
      de: string | null;
      para: string;
      /** open | won | lost — muda o texto ("Marcado como ganho") e o ícone. */
      paraTipo: string;
      origem: OrigemDoMovimento;
      /** Importação/automação moveu com a flag de pular os campos obrigatórios. */
      ignorouObrigatorios?: boolean;
    })
  | (Base & { tipo: "nota"; texto: string; autor: string | null })
  | (Base & {
      tipo: "tarefa_criada" | "tarefa_concluida";
      tarefaId: string;
      tipoTarefa: string;
      texto: string;
      prazo: string | null;
    })
  | (Base & {
      tipo: "conversa";
      conversaId: string;
      canal: string;
      contato: string | null;
      /** Ficha do contato: a última mensagem, para ler sem abrir a conversa. */
      ultimaMensagem?: string;
    });

export type TipoDoItem = ItemDaLinhaDoTempo["tipo"];

/** Conversa (o "ticket") de um contato vinculado, para a coluna de vínculos. */
export interface ConversaDoNegocio {
  id: string;
  canal: string;
  status: string;
  ultimaMensagem: string;
  /** contact | bot | human | note */
  ultimoAutor: string;
  ultimaMensagemEm: string;
  naoLida: boolean;
  contato: { id: string; name: string } | null;
  agente: string | null;
}

export interface LinhaDoTempo {
  itens: ItemDaLinhaDoTempo[];
  conversas: ConversaDoNegocio[];
}

// ---- textos ----

const CANAIS: Record<string, string> = {
  whatsapp_meta: "WhatsApp",
  whatsapp_qr: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  website: "site",
  webchat: "site",
  playground: "Playground",
};

export function rotuloDoCanal(canal: string): string {
  return CANAIS[canal] ?? canal;
}

const STATUS_DA_CONVERSA: Record<string, string> = {
  active: "Com o agente",
  waiting_human: "Aguardando atendente",
  human: "Em atendimento",
  ended: "Encerrada",
};

export function rotuloDoStatus(status: string): string {
  return STATUS_DA_CONVERSA[status] ?? status;
}

const TIPOS_DE_TAREFA: Record<string, string> = {
  ligar: "Ligar",
  whatsapp: "WhatsApp",
  email: "E-mail",
  reuniao: "Reunião",
  visita: "Visita",
  afazer: "A fazer",
  // Antigo: exibido como o novo "a fazer" (src/lib/tarefas/tipos.ts).
  outro: "A fazer",
};

export function rotuloDoTipoDeTarefa(tipo: string): string {
  return TIPOS_DE_TAREFA[tipo] ?? "Tarefa";
}

// "usuario" fica sem sufixo: é o caso comum, e "· por alguém" sem dizer quem
// só ocupa espaço (o evento não guarda quem moveu).
const ORIGENS: Record<string, string> = {
  fluxo: "pelo fluxo",
  api: "pela API",
  importacao: "na importação",
  backfill: "histórico reconstruído",
};

export interface TextoDoItem {
  titulo: string;
  /** Linha de baixo: texto da nota, descrição da tarefa, contato da conversa. */
  detalhe?: string;
}

export function descreverItem(item: ItemDaLinhaDoTempo): TextoDoItem {
  switch (item.tipo) {
    case "criado":
      if (item.negocio) return { titulo: item.etapa ? `Negócio criado em ${item.etapa}` : "Negócio criado", detalhe: item.negocio.nome };
      return { titulo: item.etapa ? `Negócio criado em ${item.etapa}` : "Negócio criado" };
    case "contato_criado":
      return { titulo: "Contato criado", detalhe: item.origem ? `Origem: ${item.origem}` : undefined };
    case "etapa": {
      const sufixo =
        (ORIGENS[item.origem] ? ` · ${ORIGENS[item.origem]}` : "") + (item.ignorouObrigatorios ? " · sem os campos obrigatórios" : "");
      const detalhe = item.negocio?.nome;
      if (item.paraTipo === "won") return { titulo: `Marcado como ganho (${item.para})${sufixo}`, detalhe };
      if (item.paraTipo === "lost") return { titulo: `Marcado como perdido (${item.para})${sufixo}`, detalhe };
      if (!item.de) return { titulo: `Entrou em ${item.para}${sufixo}`, detalhe };
      return { titulo: `Movido de ${item.de} para ${item.para}${sufixo}`, detalhe };
    }
    case "nota":
      return { titulo: item.autor ? `Nota de ${item.autor}` : "Nota", detalhe: item.texto };
    case "tarefa_criada":
      return { titulo: `Tarefa criada: ${rotuloDoTipoDeTarefa(item.tipoTarefa)}`, detalhe: item.texto };
    case "tarefa_concluida":
      return { titulo: `Tarefa concluída: ${rotuloDoTipoDeTarefa(item.tipoTarefa)}`, detalhe: item.texto };
    case "conversa":
      return {
        titulo: `Nova conversa no ${rotuloDoCanal(item.canal)}`,
        detalhe: item.ultimaMensagem ? `Última: ${item.ultimaMensagem}` : item.contato ? `com ${item.contato}` : undefined,
      };
  }
}

// ---- filtro ----

export type FiltroDaLinhaDoTempo = "tudo" | "etapas" | "notas" | "tarefas" | "conversas";

const TIPOS_DO_FILTRO: Record<Exclude<FiltroDaLinhaDoTempo, "tudo">, TipoDoItem[]> = {
  // A criação entra junto: é a primeira "etapa" do negócio (e do contato).
  etapas: ["criado", "etapa", "contato_criado"],
  notas: ["nota"],
  tarefas: ["tarefa_criada", "tarefa_concluida"],
  conversas: ["conversa"],
};

export function filtrarItens(itens: ItemDaLinhaDoTempo[], filtro: FiltroDaLinhaDoTempo): ItemDaLinhaDoTempo[] {
  if (filtro === "tudo") return itens;
  const tipos = TIPOS_DO_FILTRO[filtro];
  return itens.filter((i) => tipos.includes(i.tipo));
}

// ---- datas no fuso de São Paulo (é o horário de quem vende) ----

const FUSO = "America/Sao_Paulo";
const DIA = 86_400_000;
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** AAAA-MM-DD do instante, no calendário de São Paulo. */
export function diaEmSP(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

/** "14:05" no relógio de São Paulo. */
export function horaEmSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Hoje", "Ontem", "12 de outubro" ou, em outro ano, "12 de outubro de 2025". */
export function rotuloDoDia(dia: string, agora: Date): string {
  if (dia === diaEmSP(agora)) return "Hoje";
  if (dia === diaEmSP(new Date(agora.getTime() - DIA))) return "Ontem";
  const [a, m, d] = dia.split("-");
  const base = `${Number(d)} de ${MESES[Number(m) - 1]}`;
  return a === diaEmSP(agora).slice(0, 4) ? base : `${base} de ${a}`;
}

export interface GrupoDoDia {
  dia: string;
  rotulo: string;
  itens: ItemDaLinhaDoTempo[];
}

/**
 * Mais recente primeiro, em grupos por dia de São Paulo. Ordena aqui de novo
 * em vez de confiar na rota: a tela junta item otimista (nota recém-criada)
 * antes da resposta chegar.
 */
export function agruparPorDia(itens: ItemDaLinhaDoTempo[], agora: Date): GrupoDoDia[] {
  const ordenados = [...itens].sort((a, b) => b.em.localeCompare(a.em) || a.id.localeCompare(b.id));
  const grupos: GrupoDoDia[] = [];
  for (const item of ordenados) {
    const dia = diaEmSP(new Date(item.em));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(item);
    else grupos.push({ dia, rotulo: rotuloDoDia(dia, agora), itens: [item] });
  }
  return grupos;
}

/**
 * "desde hoje", "há 1 dia", "há 12 dias" — tempo na etapa atual, em dias de
 * calendário de São Paulo: entrou ontem às 23h é "há 1 dia", igual à linha do
 * tempo que mostra o evento em "Ontem".
 */
export function tempoNaEtapa(stageSince: string, agora: Date): string {
  const dias = Math.round((Date.parse(diaEmSP(agora)) - Date.parse(diaEmSP(new Date(stageSince)))) / DIA);
  if (dias <= 0) return "desde hoje";
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

// ---- tarefas ----

export interface TarefaResumo {
  id: string;
  type: string;
  text: string;
  dueAt: string | null;
  doneAt: string | null;
}

/**
 * Abertas primeiro, pelo prazo mais próximo (sem prazo no fim); feitas
 * depois, a mais recente em cima.
 */
export function ordenarTarefas<T extends TarefaResumo>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt !== b.dueAt) return a.dueAt ? -1 : 1;
    return 0;
  });
}

export function tarefaAtrasada(t: TarefaResumo, agora: Date): boolean {
  return !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < agora.getTime();
}
