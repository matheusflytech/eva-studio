import type { Objeto, Unidade } from "./tipos";

// ---------------------------------------------------------------------------
// Catálogo das automações: gatilhos, ações e campos que as condições enxergam.
//
// Um lugar só para a tela (seletor, formulário do painel, frase legível), a
// validação e o motor (que evento cada gatilho escuta). Sem `server-only`.
// Fonte: skill crm-automation-catalog (P0) + o que o Beeno tem e o Eva não.
// ---------------------------------------------------------------------------

export type TipoDeCampo =
  | "texto"
  | "texto_longo"
  | "numero"
  | "booleano"
  | "lista"
  | "multipla"
  | "etapa"
  | "funil"
  | "tag"
  | "usuario"
  | "usuarios"
  | "campo"
  | "campo_data"
  | "agente"
  | "canal"
  | "modelo_whatsapp"
  | "modelo_email"
  | "regua"
  | "segmento"
  | "campos_valores"
  | "url"
  | "json";

export interface CampoDeConfig {
  chave: string;
  rotulo: string;
  tipo: TipoDeCampo;
  obrigatorio?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
  ajuda?: string;
  padrao?: unknown;
  /** Só aparece (e só é exigido) quando outra chave tem este valor. */
  mostrarSe?: { chave: string; valor: unknown };
}

/** Nomes legíveis para a frase (etapa, tag, usuário...); a tela injeta o que já carregou. */
export type Nomes = Partial<Record<TipoDeCampo, (id: string) => string | undefined>>;

type Frase = (config: Record<string, unknown>, nomes: Nomes) => string;

export interface ItemDoGatilho {
  tipo: string;
  objeto: Objeto;
  nome: string;
  descricao: string;
  /**
   * evento: reage a eventos de domínio (`eventos`);
   * varredura: o relógio procura quem passou a atender (parado, data, sem resposta);
   * webhook: URL própria; manual: botão no registro ou em massa.
   */
  modo: "evento" | "varredura" | "webhook" | "manual";
  eventos: string[];
  campos: CampoDeConfig[];
  frase: Frase;
}

export type GrupoDeAcao = "registro" | "pessoas" | "cliente" | "integracao";

export interface ItemDaAcao {
  tipo: string;
  grupo: GrupoDeAcao;
  nome: string;
  descricao: string;
  objetos: Objeto[];
  /** externo = sai do Eva (WhatsApp, e-mail, HTTP): idempotência e nova tentativa. */
  efeito: "interno" | "externo";
  /** Fala com o cliente: respeita opt-out e horário silencioso. */
  falaComCliente: boolean;
  campos: CampoDeConfig[];
  frase: Frase;
}

export const NOMES_DOS_OBJETOS: Record<Objeto, { singular: string; artigo: "o" | "a"; plural: string }> = {
  deal: { singular: "negócio", artigo: "o", plural: "Negócios" },
  contact: { singular: "contato", artigo: "o", plural: "Contatos" },
  company: { singular: "empresa", artigo: "a", plural: "Empresas" },
  task: { singular: "tarefa", artigo: "a", plural: "Tarefas" },
  conversation: { singular: "conversa", artigo: "a", plural: "Conversas" },
};

// ---- ajudantes de texto ----

const UNIDADE_TEXTO: Record<Unidade, [string, string]> = {
  minutos: ["minuto", "minutos"],
  horas: ["hora", "horas"],
  dias: ["dia", "dias"],
  dias_uteis: ["dia útil", "dias úteis"],
};

export function textoDaDuracao(quantidade: unknown, unidade: unknown): string {
  const n = Number(quantidade);
  const u = UNIDADE_TEXTO[unidade as Unidade] ?? UNIDADE_TEXTO.dias;
  if (!Number.isFinite(n)) return `? ${u[1]}`;
  return `${n} ${n === 1 ? u[0] : u[1]}`;
}

/** Nome legível ou um marcador quando ainda não escolheu. */
export function nomeDe(nomes: Nomes, tipo: TipoDeCampo, valor: unknown, vazio = "…"): string {
  if (valor === undefined || valor === null || valor === "") return vazio;
  const id = String(valor);
  return nomes[tipo]?.(id) ?? id;
}

const aspas = (t: unknown, vazio = "…") => {
  const s = String(t ?? "").trim();
  return s ? `“${s.length > 40 ? `${s.slice(0, 40)}…` : s}”` : vazio;
};

const lista = (nomes: Nomes, tipo: TipoDeCampo, valores: unknown) =>
  Array.isArray(valores) && valores.length ? valores.map((v) => nomeDe(nomes, tipo, v)).join(", ") : "…";

const OPCOES_UNIDADE = [
  { valor: "minutos", rotulo: "minutos" },
  { valor: "horas", rotulo: "horas" },
  { valor: "dias", rotulo: "dias corridos" },
  { valor: "dias_uteis", rotulo: "dias úteis" },
];

// ---- gatilhos ----

const funilOpcional: CampoDeConfig = { chave: "funil", rotulo: "Só do funil", tipo: "funil", ajuda: "Vazio = qualquer funil" };
const noFunil = (c: Record<string, unknown>, n: Nomes) => (c.funil ? ` no funil ${nomeDe(n, "funil", c.funil)}` : "");

const dataRelativa = (objeto: Objeto): ItemDoGatilho => ({
  tipo: `${objeto}.date_relative`,
  objeto,
  nome: "Data de um campo",
  descricao: "Dias antes ou depois de uma data do registro (aniversário, renovação, vencimento).",
  modo: "varredura",
  eventos: [],
  campos: [
    { chave: "campo", rotulo: "Campo de data", tipo: "campo_data", obrigatorio: true },
    { chave: "dias", rotulo: "Dias (negativo = antes)", tipo: "numero", obrigatorio: true, padrao: 0 },
    { chave: "hora", rotulo: "Hora", tipo: "texto", padrao: "09:00", ajuda: "HH:MM, horário de Brasília" },
    { chave: "todo_ano", rotulo: "Repetir todo ano (aniversário)", tipo: "booleano", padrao: false },
  ],
  frase: (c, n) => {
    const d = Number(c.dias ?? 0);
    const campo = nomeDe(n, "campo_data", c.campo);
    if (!d) return `No dia de ${campo}`;
    return d < 0 ? `Quando faltar${-d === 1 ? "" : "em"} ${textoDaDuracao(-d, "dias")} para ${campo}` : `${textoDaDuracao(d, "dias")} depois de ${campo}`;
  },
});

const manual = (objeto: Objeto): ItemDoGatilho => ({
  tipo: `${objeto}.manual`,
  objeto,
  nome: "Manual",
  descricao: `Alguém aciona no ${NOMES_DOS_OBJETOS[objeto].singular} ou em massa na lista.`,
  modo: "manual",
  eventos: [],
  campos: [],
  frase: () => `Quando alguém acionar à mão n${NOMES_DOS_OBJETOS[objeto].artigo} ${NOMES_DOS_OBJETOS[objeto].singular}`,
});

const webhookDeEntrada = (objeto: Objeto): ItemDoGatilho => ({
  tipo: `${objeto}.webhook`,
  objeto,
  nome: "Webhook de entrada",
  descricao: "Outro sistema chama a URL da automação (com o id, e-mail ou telefone do registro).",
  modo: "webhook",
  eventos: [],
  campos: [],
  frase: () => "Quando chegar uma chamada na URL desta automação",
});

const campoAlterado = (objeto: Objeto, evento: string): ItemDoGatilho => ({
  tipo: `${objeto}.field_changed`,
  objeto,
  nome: "Campo alterado",
  descricao: "Só quando o valor muda de fato; mudança feita por esta mesma automação não conta.",
  modo: "evento",
  eventos: [evento],
  campos: [
    { chave: "campo", rotulo: "Campo", tipo: "campo", obrigatorio: true },
    { chave: "para", rotulo: "Passou a ser (opcional)", tipo: "texto", ajuda: "Vazio = qualquer valor novo" },
  ],
  frase: (c, n) => `Quando ${nomeDe(n, "campo", c.campo)} mudar${c.para !== undefined && c.para !== "" ? ` para ${aspas(c.para)}` : ""}`,
});

export const GATILHOS: ItemDoGatilho[] = [
  // Negócio
  {
    tipo: "deal.created",
    objeto: "deal",
    nome: "Negócio criado",
    descricao: "Um negócio novo, pela tela, conversa, API ou importação.",
    modo: "evento",
    eventos: ["deal.created"],
    campos: [funilOpcional],
    frase: (c, n) => `Quando um negócio for criado${noFunil(c, n)}`,
  },
  {
    tipo: "deal.stage_entered",
    objeto: "deal",
    nome: "Entrou na etapa",
    descricao: "Negócio chega numa etapa, ao ser criado nela, movido para ela ou nos dois casos.",
    modo: "evento",
    eventos: ["deal.created", "deal.stage_changed"],
    campos: [
      { chave: "etapa", rotulo: "Etapa", tipo: "etapa", obrigatorio: true },
      {
        chave: "quando",
        rotulo: "Vale quando",
        tipo: "lista",
        padrao: "ambos",
        opcoes: [
          { valor: "ambos", rotulo: "Criado ou movido para a etapa" },
          { valor: "movimento", rotulo: "Só movido para a etapa" },
          { valor: "criacao", rotulo: "Só criado já na etapa" },
        ],
      },
    ],
    frase: (c, n) => `Quando um negócio entrar em ${nomeDe(n, "etapa", c.etapa)}`,
  },
  {
    tipo: "deal.stage_left",
    objeto: "deal",
    nome: "Saiu da etapa",
    descricao: "Negócio sai de uma etapa (para qualquer outra).",
    modo: "evento",
    eventos: ["deal.stage_changed"],
    campos: [{ chave: "etapa", rotulo: "Etapa", tipo: "etapa", obrigatorio: true }],
    frase: (c, n) => `Quando um negócio sair de ${nomeDe(n, "etapa", c.etapa)}`,
  },
  {
    tipo: "deal.won",
    objeto: "deal",
    nome: "Negócio ganho",
    descricao: "Negócio vai para uma etapa de ganho.",
    modo: "evento",
    eventos: ["deal.won"],
    campos: [funilOpcional],
    frase: (c, n) => `Quando um negócio for ganho${noFunil(c, n)}`,
  },
  {
    tipo: "deal.lost",
    objeto: "deal",
    nome: "Negócio perdido",
    descricao: "Negócio vai para uma etapa de perda; dá para filtrar pelo motivo.",
    modo: "evento",
    eventos: ["deal.lost"],
    campos: [funilOpcional, { chave: "motivo", rotulo: "Motivo contém (opcional)", tipo: "texto" }],
    frase: (c, n) => `Quando um negócio for perdido${noFunil(c, n)}${c.motivo ? ` por ${aspas(c.motivo)}` : ""}`,
  },
  // Venda da Hotmart (Integrações › Hotmart): o objeto é o negócio do produto.
  ...(
    [
      ["sale.approved", "Venda aprovada", "Pagamento aprovado na Hotmart (compra ou mensalidade).", "uma venda for aprovada"],
      ["sale.refunded", "Venda reembolsada", "A Hotmart devolveu o dinheiro da compra.", "uma venda for reembolsada"],
      ["sale.chargeback", "Chargeback", "O comprador contestou a compra no cartão.", "houver chargeback"],
      ["sale.canceled", "Compra cancelada", "Compra ou assinatura cancelada na Hotmart.", "uma compra for cancelada"],
    ] as const
  ).map(
    ([tipo, nome, descricao, quando]): ItemDoGatilho => ({
      tipo,
      objeto: "deal",
      nome,
      descricao,
      modo: "evento",
      eventos: [tipo],
      campos: [funilOpcional],
      frase: (c, n) => `Quando ${quando}${noFunil(c, n)}`,
    })
  ),
  {
    tipo: "deal.reopened",
    objeto: "deal",
    nome: "Negócio reaberto",
    descricao: "Negócio ganho ou perdido volta para uma etapa aberta.",
    modo: "evento",
    eventos: ["deal.reopened"],
    campos: [funilOpcional],
    frase: (c, n) => `Quando um negócio for reaberto${noFunil(c, n)}`,
  },
  {
    tipo: "deal.stale",
    objeto: "deal",
    nome: "Parado há dias",
    descricao: "Negócio aberto sem mudar de etapa nem ter atividade há N dias.",
    modo: "varredura",
    eventos: [],
    campos: [
      { chave: "dias", rotulo: "Dias parado", tipo: "numero", obrigatorio: true, padrao: 7 },
      { chave: "etapa", rotulo: "Só na etapa", tipo: "etapa", ajuda: "Vazio = qualquer etapa aberta" },
    ],
    frase: (c, n) => `Quando um negócio ficar parado ${textoDaDuracao(c.dias, "dias")}${c.etapa ? ` em ${nomeDe(n, "etapa", c.etapa)}` : ""}`,
  },
  campoAlterado("deal", "deal.updated"),
  {
    tipo: "deal.owner_changed",
    objeto: "deal",
    nome: "Responsável alterado",
    descricao: "O negócio mudou de responsável.",
    modo: "evento",
    eventos: ["deal.owner_changed"],
    campos: [],
    frase: () => "Quando o responsável de um negócio mudar",
  },
  dataRelativa("deal"),
  {
    tipo: "deal.schedule",
    objeto: "deal",
    nome: "Agendado",
    descricao: "Todo dia ou toda semana, para os negócios abertos de um funil ou etapa.",
    modo: "varredura",
    eventos: [],
    campos: [
      { chave: "frequencia", rotulo: "Frequência", tipo: "lista", padrao: "diaria", opcoes: [{ valor: "diaria", rotulo: "Todo dia" }, { valor: "semanal", rotulo: "Toda semana" }] },
      {
        chave: "dia_semana",
        rotulo: "Dia da semana",
        tipo: "lista",
        padrao: "1",
        mostrarSe: { chave: "frequencia", valor: "semanal" },
        opcoes: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((r, i) => ({ valor: String(i), rotulo: r })),
      },
      { chave: "hora", rotulo: "Hora", tipo: "texto", padrao: "09:00" },
      funilOpcional,
      { chave: "etapa", rotulo: "Só na etapa", tipo: "etapa" },
    ],
    frase: (c, n) => `${c.frequencia === "semanal" ? "Toda semana" : "Todo dia"} às ${String(c.hora ?? "09:00")}, para os negócios abertos${noFunil(c, n)}${c.etapa ? ` em ${nomeDe(n, "etapa", c.etapa)}` : ""}`,
  },
  webhookDeEntrada("deal"),
  manual("deal"),

  // Contato
  {
    tipo: "contact.created",
    objeto: "contact",
    nome: "Contato criado",
    descricao: "Contato novo, pela tela, conversa, formulário, API ou importação.",
    modo: "evento",
    eventos: ["contact.created"],
    campos: [],
    frase: () => "Quando um contato for criado",
  },
  campoAlterado("contact", "contact.updated"),
  {
    tipo: "contact.tag_added",
    objeto: "contact",
    nome: "Etiqueta adicionada",
    descricao: "O contato ganhou uma etiqueta.",
    modo: "evento",
    eventos: ["contact.tag_added"],
    campos: [{ chave: "tag", rotulo: "Etiqueta", tipo: "tag", obrigatorio: true }],
    frase: (c, n) => `Quando um contato ganhar a etiqueta ${nomeDe(n, "tag", c.tag)}`,
  },
  {
    tipo: "contact.tag_removed",
    objeto: "contact",
    nome: "Etiqueta removida",
    descricao: "O contato perdeu uma etiqueta.",
    modo: "evento",
    eventos: ["contact.tag_removed"],
    campos: [{ chave: "tag", rotulo: "Etiqueta", tipo: "tag", obrigatorio: true }],
    frase: (c, n) => `Quando um contato perder a etiqueta ${nomeDe(n, "tag", c.tag)}`,
  },
  {
    tipo: "lead.captured",
    objeto: "contact",
    nome: "Virou lead",
    descricao: "O contato entrou nos Leads (agente, formulário ou API).",
    modo: "evento",
    eventos: ["lead.captured"],
    campos: [],
    frase: () => "Quando um contato virar lead",
  },
  dataRelativa("contact"),
  {
    tipo: "contact.schedule",
    objeto: "contact",
    nome: "Agendado",
    descricao: "Todo dia ou toda semana, para os contatos de um segmento.",
    modo: "varredura",
    eventos: [],
    campos: [
      { chave: "frequencia", rotulo: "Frequência", tipo: "lista", padrao: "diaria", opcoes: [{ valor: "diaria", rotulo: "Todo dia" }, { valor: "semanal", rotulo: "Toda semana" }] },
      {
        chave: "dia_semana",
        rotulo: "Dia da semana",
        tipo: "lista",
        padrao: "1",
        mostrarSe: { chave: "frequencia", valor: "semanal" },
        opcoes: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((r, i) => ({ valor: String(i), rotulo: r })),
      },
      { chave: "hora", rotulo: "Hora", tipo: "texto", padrao: "09:00" },
      { chave: "segmento", rotulo: "Segmento", tipo: "segmento", obrigatorio: true },
    ],
    frase: (c, n) => `${c.frequencia === "semanal" ? "Toda semana" : "Todo dia"} às ${String(c.hora ?? "09:00")}, para o segmento ${nomeDe(n, "segmento", c.segmento)}`,
  },
  webhookDeEntrada("contact"),
  manual("contact"),

  // Empresa
  {
    tipo: "company.created",
    objeto: "company",
    nome: "Empresa criada",
    descricao: "Empresa nova, pela tela, API ou importação.",
    modo: "evento",
    eventos: ["company.created"],
    campos: [],
    frase: () => "Quando uma empresa for criada",
  },
  campoAlterado("company", "company.updated"),
  dataRelativa("company"),
  webhookDeEntrada("company"),
  manual("company"),

  // Tarefa
  {
    tipo: "task.created",
    objeto: "task",
    nome: "Tarefa criada",
    descricao: "Tarefa nova (de qualquer origem).",
    modo: "evento",
    eventos: ["task.created"],
    campos: [{ chave: "tipo_tarefa", rotulo: "Só do tipo", tipo: "texto", ajuda: "ligar, email, reuniao... Vazio = qualquer" }],
    frase: (c) => `Quando uma tarefa${c.tipo_tarefa ? ` do tipo ${aspas(c.tipo_tarefa)}` : ""} for criada`,
  },
  {
    tipo: "task.completed",
    objeto: "task",
    nome: "Tarefa concluída",
    descricao: "Tarefa marcada como feita.",
    modo: "evento",
    eventos: ["task.completed"],
    campos: [{ chave: "tipo_tarefa", rotulo: "Só do tipo", tipo: "texto" }],
    frase: (c) => `Quando uma tarefa${c.tipo_tarefa ? ` do tipo ${aspas(c.tipo_tarefa)}` : ""} for concluída`,
  },
  {
    tipo: "task.overdue",
    objeto: "task",
    nome: "Tarefa atrasada",
    descricao: "Tarefa aberta passou do prazo.",
    modo: "varredura",
    eventos: [],
    campos: [{ chave: "horas", rotulo: "Horas de atraso", tipo: "numero", padrao: 0 }],
    frase: (c) => (Number(c.horas) > 0 ? `Quando uma tarefa passar ${textoDaDuracao(c.horas, "horas")} do prazo` : "Quando uma tarefa passar do prazo"),
  },
  manual("task"),

  // Conversa
  {
    tipo: "message.received",
    objeto: "conversation",
    nome: "Mensagem recebida",
    descricao: "O cliente escreveu: a primeira mensagem, qualquer uma ou uma com palavra-chave.",
    modo: "evento",
    eventos: ["message.received"],
    campos: [
      {
        chave: "modo",
        rotulo: "Qual mensagem",
        tipo: "lista",
        padrao: "primeira",
        opcoes: [
          { valor: "primeira", rotulo: "A primeira da conversa" },
          { valor: "qualquer", rotulo: "Qualquer mensagem" },
          { valor: "contem", rotulo: "Com uma destas palavras" },
        ],
      },
      { chave: "palavras", rotulo: "Palavras (separadas por vírgula)", tipo: "texto", obrigatorio: true, mostrarSe: { chave: "modo", valor: "contem" } },
      { chave: "canal", rotulo: "Só do canal", tipo: "canal" },
      { chave: "intervalo_min", rotulo: "Não repetir por (min)", tipo: "numero", padrao: 60, ajuda: "Evita disparar a cada mensagem da mesma conversa" },
    ],
    frase: (c) =>
      c.modo === "contem"
        ? `Quando o cliente escrever ${aspas(c.palavras)}`
        : c.modo === "qualquer"
          ? "Quando o cliente mandar mensagem"
          : "Quando chegar a primeira mensagem de uma conversa",
  },
  {
    tipo: "conversation.no_reply",
    objeto: "conversation",
    nome: "Cliente sem responder",
    descricao: "A última mensagem foi da empresa e o cliente não respondeu há X horas.",
    modo: "varredura",
    eventos: [],
    campos: [
      { chave: "horas", rotulo: "Horas sem resposta", tipo: "numero", obrigatorio: true, padrao: 24 },
      { chave: "canal", rotulo: "Só do canal", tipo: "canal" },
    ],
    frase: (c) => `Quando o cliente ficar ${textoDaDuracao(c.horas, "horas")} sem responder`,
  },
  {
    tipo: "conversation.waiting_human",
    objeto: "conversation",
    nome: "Aguardando atendente",
    descricao: "O agente passou para a equipe e ninguém respondeu há X minutos (SLA).",
    modo: "varredura",
    eventos: [],
    campos: [{ chave: "minutos", rotulo: "Minutos esperando", tipo: "numero", obrigatorio: true, padrao: 5 }],
    frase: (c) => `Quando uma conversa esperar atendente por ${textoDaDuracao(c.minutos, "minutos")}`,
  },
];

// ---- ações ----

const TODOS_MENOS_TAREFA: Objeto[] = ["deal", "contact", "company", "conversation"];

export const ACOES: ItemDaAcao[] = [
  // Registro
  {
    tipo: "record.update_fields",
    grupo: "registro",
    nome: "Atualizar campos",
    descricao: "Preenche ou limpa campos do registro (aceita variáveis).",
    objetos: ["deal", "contact", "company", "task"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "campos", rotulo: "Campos", tipo: "campos_valores", obrigatorio: true }],
    frase: (c, n) => {
      const l = Array.isArray(c.campos) ? (c.campos as { campo?: string }[]) : [];
      return l.length ? `atualizar ${l.map((x) => nomeDe(n, "campo", x.campo)).join(", ")}` : "atualizar campos";
    },
  },
  {
    tipo: "deal.move_stage",
    grupo: "registro",
    nome: "Mover de etapa",
    descricao: "Move o negócio para outra etapa (inclusive de outro funil).",
    objetos: ["deal"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "etapa", rotulo: "Etapa", tipo: "etapa", obrigatorio: true }],
    frase: (c, n) => `mover para ${nomeDe(n, "etapa", c.etapa)}`,
  },
  {
    tipo: "deal.mark_won",
    grupo: "registro",
    nome: "Marcar como ganho",
    descricao: "Leva o negócio para a etapa de ganho do funil.",
    objetos: ["deal"],
    efeito: "interno",
    falaComCliente: false,
    campos: [],
    frase: () => "marcar como ganho",
  },
  {
    tipo: "deal.mark_lost",
    grupo: "registro",
    nome: "Marcar como perdido",
    descricao: "Leva o negócio para a etapa de perda, com o motivo.",
    objetos: ["deal"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true }],
    frase: (c) => `marcar como perdido (${aspas(c.motivo)})`,
  },
  {
    tipo: "deal.create",
    grupo: "registro",
    nome: "Criar negócio",
    descricao: "Abre um negócio ligado ao contato ou empresa (inclusive em outro funil).",
    objetos: ["deal", "contact", "company", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [
      { chave: "nome", rotulo: "Nome do negócio", tipo: "texto", obrigatorio: true, padrao: "{{contato.name}}" },
      { chave: "etapa", rotulo: "Etapa", tipo: "etapa", obrigatorio: true },
      { chave: "valor_centavos", rotulo: "Valor (centavos)", tipo: "numero" },
      { chave: "se_ja_tem", rotulo: "Se já tem negócio aberto", tipo: "lista", padrao: "pular", opcoes: [{ valor: "pular", rotulo: "Não criar outro" }, { valor: "criar", rotulo: "Criar mesmo assim" }] },
    ],
    frase: (c, n) => `criar o negócio ${aspas(c.nome)} em ${nomeDe(n, "etapa", c.etapa)}`,
  },
  {
    tipo: "contact.upsert",
    grupo: "registro",
    nome: "Criar ou atualizar contato",
    descricao: "Acha pelo e-mail ou telefone; cria se não achar.",
    objetos: ["deal", "company", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto" },
      { chave: "email", rotulo: "E-mail", tipo: "texto" },
      { chave: "telefone", rotulo: "Telefone", tipo: "texto" },
    ],
    frase: () => "criar ou atualizar o contato",
  },
  {
    tipo: "contact.add_tag",
    grupo: "registro",
    nome: "Adicionar etiqueta",
    descricao: "No contato (do registro ou da conversa).",
    objetos: ["deal", "contact", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "tag", rotulo: "Etiqueta", tipo: "tag", obrigatorio: true }],
    frase: (c, n) => `adicionar a etiqueta ${nomeDe(n, "tag", c.tag)}`,
  },
  {
    tipo: "contact.remove_tag",
    grupo: "registro",
    nome: "Remover etiqueta",
    descricao: "Do contato (do registro ou da conversa).",
    objetos: ["deal", "contact", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "tag", rotulo: "Etiqueta", tipo: "tag", obrigatorio: true }],
    frase: (c, n) => `remover a etiqueta ${nomeDe(n, "tag", c.tag)}`,
  },
  {
    tipo: "note.create",
    grupo: "registro",
    nome: "Criar nota",
    descricao: "Registra uma nota na linha do tempo (aceita variáveis).",
    objetos: ["deal", "contact", "company", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "texto", rotulo: "Texto", tipo: "texto_longo", obrigatorio: true }],
    frase: (c) => `anotar ${aspas(c.texto)}`,
  },

  // Pessoas
  {
    tipo: "owner.assign",
    grupo: "pessoas",
    nome: "Atribuir responsável",
    descricao: "Uma pessoa fixa, rodízio (igual ou por percentual) ou quem tem menos trabalho aberto.",
    objetos: TODOS_MENOS_TAREFA,
    efeito: "interno",
    falaComCliente: false,
    campos: [
      {
        chave: "modo",
        rotulo: "Como",
        tipo: "lista",
        padrao: "rodizio",
        opcoes: [
          { valor: "fixo", rotulo: "Sempre a mesma pessoa" },
          { valor: "rodizio", rotulo: "Rodízio" },
          { valor: "menos_carga", rotulo: "Quem tem menos negócios abertos" },
        ],
      },
      { chave: "usuario", rotulo: "Pessoa", tipo: "usuario", obrigatorio: true, mostrarSe: { chave: "modo", valor: "fixo" } },
      { chave: "usuarios", rotulo: "Pessoas", tipo: "usuarios", obrigatorio: true, mostrarSe: { chave: "modo", valor: "rodizio" } },
      { chave: "pesos", rotulo: "Percentual por pessoa (opcional)", tipo: "json", mostrarSe: { chave: "modo", valor: "rodizio" }, ajuda: "{ \"idDaPessoa\": 60 }. Vazio = igual" },
      { chave: "usuarios_carga", rotulo: "Entre", tipo: "usuarios", obrigatorio: true, mostrarSe: { chave: "modo", valor: "menos_carga" } },
      { chave: "so_se_vazio", rotulo: "Só se ainda não tiver responsável", tipo: "booleano", padrao: false },
    ],
    frase: (c, n) =>
      c.modo === "fixo"
        ? `atribuir a ${nomeDe(n, "usuario", c.usuario)}`
        : c.modo === "menos_carga"
          ? `atribuir a quem tem menos trabalho (${lista(n, "usuario", c.usuarios_carga)})`
          : `atribuir em rodízio (${lista(n, "usuario", c.usuarios)})`,
  },
  {
    tipo: "task.create",
    grupo: "pessoas",
    nome: "Criar tarefa",
    descricao: "Tarefa para o responsável ou outra pessoa, com prazo em dias úteis.",
    objetos: TODOS_MENOS_TAREFA,
    efeito: "interno",
    falaComCliente: false,
    campos: [
      { chave: "texto", rotulo: "Tarefa", tipo: "texto", obrigatorio: true },
      {
        chave: "tipo_tarefa",
        rotulo: "Tipo",
        tipo: "lista",
        padrao: "afazer",
        opcoes: [
          { valor: "afazer", rotulo: "A fazer" },
          { valor: "ligar", rotulo: "Ligar" },
          { valor: "whatsapp", rotulo: "WhatsApp" },
          { valor: "email", rotulo: "E-mail" },
          { valor: "reuniao", rotulo: "Reunião" },
          { valor: "visita", rotulo: "Visita" },
        ],
      },
      { chave: "prazo", rotulo: "Prazo", tipo: "numero", padrao: 1 },
      { chave: "unidade", rotulo: "Em", tipo: "lista", padrao: "dias_uteis", opcoes: OPCOES_UNIDADE },
      { chave: "para", rotulo: "Para", tipo: "lista", padrao: "responsavel", opcoes: [{ valor: "responsavel", rotulo: "O responsável do registro" }, { valor: "usuario", rotulo: "Uma pessoa" }] },
      { chave: "usuario", rotulo: "Pessoa", tipo: "usuario", obrigatorio: true, mostrarSe: { chave: "para", valor: "usuario" } },
    ],
    frase: (c) => `criar a tarefa ${aspas(c.texto)} para daqui a ${textoDaDuracao(c.prazo ?? 1, c.unidade ?? "dias_uteis")}`,
  },
  {
    tipo: "task.complete_open",
    grupo: "pessoas",
    nome: "Concluir tarefas abertas",
    descricao: "Fecha as tarefas abertas do registro (ex.: ganhou, não precisa mais ligar).",
    objetos: ["deal", "contact"],
    efeito: "interno",
    falaComCliente: false,
    campos: [],
    frase: () => "concluir as tarefas abertas",
  },
  {
    tipo: "team.notify",
    grupo: "pessoas",
    nome: "Avisar a equipe",
    descricao: "Aviso no app (e por e-mail, se quiser) para o responsável ou outras pessoas.",
    objetos: ["deal", "contact", "company", "task", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [
      { chave: "para", rotulo: "Para", tipo: "lista", padrao: "responsavel", opcoes: [{ valor: "responsavel", rotulo: "O responsável" }, { valor: "usuarios", rotulo: "Estas pessoas" }] },
      { chave: "usuarios", rotulo: "Pessoas", tipo: "usuarios", obrigatorio: true, mostrarSe: { chave: "para", valor: "usuarios" } },
      { chave: "mensagem", rotulo: "Mensagem", tipo: "texto_longo", obrigatorio: true },
      { chave: "email", rotulo: "Mandar também por e-mail", tipo: "booleano", padrao: false },
    ],
    frase: (c, n) => `avisar ${c.para === "usuarios" ? lista(n, "usuario", c.usuarios) : "o responsável"}`,
  },

  // Cliente
  {
    tipo: "whatsapp.send",
    grupo: "cliente",
    nome: "Mandar WhatsApp",
    descricao: "Pelo agente e canal escolhidos. Fora da janela de 24h só sai modelo aprovado.",
    objetos: ["deal", "contact", "conversation"],
    efeito: "externo",
    falaComCliente: true,
    campos: [
      { chave: "agente", rotulo: "Agente que manda", tipo: "agente", obrigatorio: true },
      { chave: "canal", rotulo: "Canal", tipo: "canal", ajuda: "Vazio = o da conversa, ou o WhatsApp do agente" },
      { chave: "modo", rotulo: "Mensagem", tipo: "lista", padrao: "texto", opcoes: [{ valor: "texto", rotulo: "Texto" }, { valor: "modelo", rotulo: "Modelo aprovado" }] },
      { chave: "texto", rotulo: "Texto", tipo: "texto_longo", obrigatorio: true, mostrarSe: { chave: "modo", valor: "texto" } },
      { chave: "modelo", rotulo: "Modelo", tipo: "modelo_whatsapp", obrigatorio: true, mostrarSe: { chave: "modo", valor: "modelo" } },
      {
        chave: "sem_janela",
        rotulo: "Se a janela de 24h estiver fechada",
        tipo: "lista",
        padrao: "pular",
        mostrarSe: { chave: "modo", valor: "texto" },
        opcoes: [
          { valor: "pular", rotulo: "Pular este passo" },
          { valor: "falhar", rotulo: "Seguir pelo caminho de erro" },
        ],
      },
    ],
    frase: (c, n) => (c.modo === "modelo" ? `mandar o modelo ${nomeDe(n, "modelo_whatsapp", c.modelo)} no WhatsApp` : `mandar ${aspas(c.texto)} no WhatsApp`),
  },
  {
    tipo: "email.send",
    grupo: "cliente",
    nome: "Mandar e-mail",
    descricao: "Modelo da Biblioteca, pelo domínio verificado do contrato.",
    objetos: ["deal", "contact", "conversation"],
    efeito: "externo",
    falaComCliente: true,
    campos: [{ chave: "modelo", rotulo: "Modelo de e-mail", tipo: "modelo_email", obrigatorio: true }],
    frase: (c, n) => `mandar o e-mail ${nomeDe(n, "modelo_email", c.modelo)}`,
  },
  {
    tipo: "sequence.enroll",
    grupo: "cliente",
    nome: "Inscrever na régua",
    descricao: "Coloca o contato numa régua (Sequências).",
    objetos: ["deal", "contact", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "regua", rotulo: "Régua", tipo: "regua", obrigatorio: true }],
    frase: (c, n) => `inscrever na régua ${nomeDe(n, "regua", c.regua)}`,
  },
  {
    tipo: "sequence.remove",
    grupo: "cliente",
    nome: "Tirar da régua",
    descricao: "Para uma régua (ou todas) do contato.",
    objetos: ["deal", "contact", "conversation"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "regua", rotulo: "Régua", tipo: "regua", ajuda: "Vazio = todas" }],
    frase: (c, n) => (c.regua ? `tirar da régua ${nomeDe(n, "regua", c.regua)}` : "tirar de todas as réguas"),
  },
  {
    tipo: "conversation.handoff",
    grupo: "cliente",
    nome: "Passar para atendente",
    descricao: "O agente para de responder e a conversa vai para a fila da equipe (ou para uma pessoa).",
    objetos: ["conversation", "contact", "deal"],
    efeito: "interno",
    falaComCliente: false,
    campos: [{ chave: "usuario", rotulo: "Para (opcional)", tipo: "usuario", ajuda: "Vazio = fila da equipe" }],
    frase: (c, n) => (c.usuario ? `passar a conversa para ${nomeDe(n, "usuario", c.usuario)}` : "passar a conversa para a equipe"),
  },

  // Integração
  {
    tipo: "n8n.webhook",
    grupo: "integracao",
    nome: "Enviar para o n8n",
    descricao: "POST assinado (Standard Webhooks) com o registro; a resposta JSON vira variável.",
    objetos: ["deal", "contact", "company", "task", "conversation"],
    efeito: "externo",
    falaComCliente: false,
    campos: [
      { chave: "url", rotulo: "URL (Production URL do nó Webhook)", tipo: "url", obrigatorio: true },
      { chave: "extra", rotulo: "Dados extras (JSON, aceita variáveis)", tipo: "json" },
      { chave: "segredo", rotulo: "Segredo da assinatura (opcional)", tipo: "texto", ajuda: "whsec_... Com ele o n8n confere que o envio veio do Eva (headers webhook-*)." },
    ],
    frase: () => "enviar para o n8n",
  },
  {
    tipo: "http.request",
    grupo: "integracao",
    nome: "Chamar uma API",
    descricao: "HTTP com método, cabeçalhos e corpo; a resposta vira variável.",
    objetos: ["deal", "contact", "company", "task", "conversation"],
    efeito: "externo",
    falaComCliente: false,
    campos: [
      {
        chave: "metodo",
        rotulo: "Método",
        tipo: "lista",
        padrao: "POST",
        opcoes: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ valor: m, rotulo: m })),
      },
      { chave: "url", rotulo: "URL", tipo: "url", obrigatorio: true },
      { chave: "cabecalhos", rotulo: "Cabeçalhos (JSON)", tipo: "json" },
      { chave: "corpo", rotulo: "Corpo", tipo: "texto_longo" },
    ],
    frase: (c) => `chamar ${String(c.metodo ?? "POST")} ${c.url ? safeHost(c.url) : "…"}`,
  },
];

function safeHost(u: unknown): string {
  try {
    return new URL(String(u)).host;
  } catch {
    return String(u);
  }
}

// ---- campos que as condições enxergam (formato da API v1) ----

export type TipoDoValor = "texto" | "numero" | "data" | "booleano" | "lista" | "etapa" | "funil" | "usuario" | "tag";

export interface CampoDoContexto {
  caminho: string;
  rotulo: string;
  tipo: TipoDoValor;
  grupo: string;
}

const C = (grupo: string, caminho: string, rotulo: string, tipo: TipoDoValor): CampoDoContexto => ({ grupo, caminho, rotulo, tipo });

const DO_CONTATO = (prefixo: string, grupo: string): CampoDoContexto[] => [
  C(grupo, `${prefixo}.name`, "Nome", "texto"),
  C(grupo, `${prefixo}.email`, "E-mail", "texto"),
  C(grupo, `${prefixo}.phone`, "Telefone", "texto"),
  C(grupo, `${prefixo}.job_title`, "Cargo", "texto"),
  C(grupo, `${prefixo}.tags`, "Etiquetas", "tag"),
  C(grupo, `${prefixo}.owner_id`, "Responsável", "usuario"),
  C(grupo, `${prefixo}.opt_in`, "Aceita mensagens", "booleano"),
  C(grupo, `${prefixo}.lead_stage`, "Etapa do lead", "texto"),
  C(grupo, `${prefixo}.source`, "Origem", "texto"),
  C(grupo, `${prefixo}.created_at`, "Criado em", "data"),
];

const SISTEMA: CampoDoContexto[] = [
  C("Agora", "sistema.dia_util", "É dia útil", "booleano"),
  C("Agora", "sistema.horario_comercial", "Em horário comercial (8h–20h)", "booleano"),
  C("Agora", "sistema.dia_semana", "Dia da semana (0 = domingo)", "numero"),
  C("Agora", "sistema.hora", "Hora (0–23)", "numero"),
];

export const CAMPOS_DO_CONTEXTO: Record<Objeto, CampoDoContexto[]> = {
  deal: [
    C("Negócio", "registro.name", "Nome", "texto"),
    C("Negócio", "registro.amount_cents", "Valor (centavos)", "numero"),
    C("Negócio", "registro.pipeline_id", "Funil", "funil"),
    C("Negócio", "registro.stage_id", "Etapa", "etapa"),
    C("Negócio", "registro.status", "Situação (open, won, lost)", "texto"),
    C("Negócio", "registro.owner_id", "Responsável", "usuario"),
    C("Negócio", "registro.lost_reason", "Motivo da perda", "texto"),
    C("Negócio", "registro.expected_closing_at", "Previsão de fechamento", "data"),
    C("Negócio", "registro.created_at", "Criado em", "data"),
    C("Negócio", "registro.tem_tarefa_aberta", "Tem tarefa aberta", "booleano"),
    ...DO_CONTATO("contato", "Contato principal"),
    C("Empresa", "empresa.name", "Nome da empresa", "texto"),
    C("Empresa", "empresa.cnpj", "CNPJ", "texto"),
    ...SISTEMA,
  ],
  contact: [
    ...DO_CONTATO("registro", "Contato"),
    C("Contato", "registro.tem_negocio_aberto", "Tem negócio aberto", "booleano"),
    C("Contato", "registro.janela_aberta", "Janela de 24h aberta no WhatsApp", "booleano"),
    C("Empresa", "empresa.name", "Nome da empresa", "texto"),
    ...SISTEMA,
  ],
  company: [
    C("Empresa", "registro.name", "Nome", "texto"),
    C("Empresa", "registro.cnpj", "CNPJ", "texto"),
    C("Empresa", "registro.sector", "Setor", "texto"),
    C("Empresa", "registro.city", "Cidade", "texto"),
    C("Empresa", "registro.uf", "UF", "texto"),
    C("Empresa", "registro.owner_id", "Responsável", "usuario"),
    C("Empresa", "registro.created_at", "Criada em", "data"),
    ...SISTEMA,
  ],
  task: [
    C("Tarefa", "registro.text", "Texto", "texto"),
    C("Tarefa", "registro.type", "Tipo", "texto"),
    C("Tarefa", "registro.due_at", "Prazo", "data"),
    C("Tarefa", "registro.done", "Concluída", "booleano"),
    C("Tarefa", "registro.assigned_to_id", "Responsável", "usuario"),
    ...SISTEMA,
  ],
  conversation: [
    C("Conversa", "registro.channel", "Canal", "texto"),
    C("Conversa", "registro.agent_id", "Agente", "texto"),
    C("Conversa", "registro.status", "Situação (active, human, waiting_human...)", "texto"),
    C("Conversa", "registro.janela_aberta", "Janela de 24h aberta", "booleano"),
    C("Conversa", "gatilho.text", "Texto da mensagem que disparou", "texto"),
    ...DO_CONTATO("contato", "Contato"),
    ...SISTEMA,
  ],
};

// ---- buscas ----

export const gatilhoDoTipo = (tipo: string) => GATILHOS.find((g) => g.tipo === tipo);
export const acaoDoTipo = (tipo: string) => ACOES.find((a) => a.tipo === tipo);
export const gatilhosDoObjeto = (objeto: Objeto) => GATILHOS.filter((g) => g.objeto === objeto);
export const acoesDoObjeto = (objeto: Objeto) => ACOES.filter((a) => a.objetos.includes(objeto));

/** Eventos que o "esperar evento" sabe escutar no registro. */
export const EVENTOS_DE_ESPERA: { tipo: string; nome: string; objetos: Objeto[] }[] = [
  { tipo: "message.received", nome: "O cliente responder", objetos: ["deal", "contact", "conversation"] },
  { tipo: "deal.stage_changed", nome: "O negócio mudar de etapa", objetos: ["deal"] },
  { tipo: "deal.won", nome: "O negócio ser ganho", objetos: ["deal"] },
  { tipo: "task.completed", nome: "A tarefa ser concluída", objetos: ["task", "deal", "contact"] },
  { tipo: "contact.tag_added", nome: "O contato ganhar uma etiqueta", objetos: ["contact", "deal"] },
];

/** Campos de configuração que valem agora (respeita `mostrarSe`). */
export function camposVisiveis(campos: CampoDeConfig[], config: Record<string, unknown>): CampoDeConfig[] {
  return campos.filter((c) => {
    if (!c.mostrarSe) return true;
    const atual = config[c.mostrarSe.chave] ?? campos.find((x) => x.chave === c.mostrarSe!.chave)?.padrao;
    return atual === c.mostrarSe.valor;
  });
}

/** Configuração inicial de um gatilho ou ação (os padrões do catálogo). */
export function configPadrao(campos: CampoDeConfig[]): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const campo of campos) if (campo.padrao !== undefined) c[campo.chave] = campo.padrao;
  return c;
}
