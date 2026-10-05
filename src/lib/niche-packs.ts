import type { TipoDeCampo } from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Pacotes por tipo de negócio.
//
// Quem abre um CRM vazio não sabe por onde começar: que etapas um funil de
// energia solar tem? que dados anotar de um paciente? O pacote responde isso de
// uma vez, com funil, campos e um atendimento que já pergunta o que importa e
// preenche o CRM sozinho. Tudo continua editável depois, e nada aqui precisa de
// chave de IA: o atendimento do pacote é um fluxo de perguntas fixas.
// ---------------------------------------------------------------------------

export interface EtapaDoPacote {
  name: string;
  type: "open" | "won" | "lost";
  probability: number;
  color?: string;
}

export interface CampoDoPacote {
  entity: "deal" | "contact";
  label: string;
  type: TipoDeCampo;
  options?: string[];
  showOnCard?: boolean;
  /** Se informada, o atendimento pergunta isto ao cliente e grava a resposta no campo. */
  pergunta?: string;
}

export interface PacoteDeNicho {
  id: string;
  nome: string;
  descricao: string;
  /** Nome de ícone do lucide, resolvido na tela. */
  icone: "sun" | "building" | "heart" | "shopping" | "briefcase" | "graduation" | "blank";
  funil: { nome: string; etapas: EtapaDoPacote[] };
  campos: CampoDoPacote[];
  /** Frase que descreve o negócio, usada nas instruções do agente. */
  contexto: string;
  /** Texto de abertura do atendimento ({empresa} vira o nome informado). */
  abertura: string;
}

const VENDA_PADRAO: EtapaDoPacote[] = [
  { name: "Novo", type: "open", probability: 10, color: "slate" },
  { name: "Em contato", type: "open", probability: 30, color: "blue" },
  { name: "Proposta", type: "open", probability: 60, color: "violet" },
  { name: "Negociação", type: "open", probability: 80, color: "amber" },
  { name: "Ganho", type: "won", probability: 100 },
  { name: "Perdido", type: "lost", probability: 0 },
];

export const PACOTES: PacoteDeNicho[] = [
  {
    id: "solar",
    nome: "Energia solar",
    descricao: "Do primeiro contato à instalação: consumo, tipo de imóvel, visita técnica e proposta.",
    icone: "sun",
    contexto: "A empresa vende e instala sistemas de energia solar fotovoltaica para casas, comércios e indústrias.",
    abertura: "Olá! Aqui é o atendimento da {empresa}. Vou fazer algumas perguntas rápidas para montar a sua proposta de energia solar. Primeiro, qual é o seu nome?",
    funil: {
      nome: "Vendas de energia solar",
      etapas: [
        { name: "Novo lead", type: "open", probability: 10, color: "slate" },
        { name: "Visita técnica", type: "open", probability: 30, color: "blue" },
        { name: "Proposta enviada", type: "open", probability: 55, color: "violet" },
        { name: "Negociação", type: "open", probability: 75, color: "amber" },
        { name: "Instalação contratada", type: "won", probability: 100 },
        { name: "Perdido", type: "lost", probability: 0 },
      ],
    },
    campos: [
      { entity: "deal", label: "Consumo mensal (kWh)", type: "number", showOnCard: true, pergunta: "Quanto você consome de energia por mês? Se souber, me diga os kWh que aparecem na sua conta de luz." },
      { entity: "deal", label: "Tipo de imóvel", type: "select", options: ["Casa", "Apartamento", "Comércio", "Indústria", "Rural"], showOnCard: true, pergunta: "O sistema seria instalado em que tipo de imóvel?" },
      { entity: "deal", label: "Valor do sistema", type: "currency" },
      { entity: "deal", label: "Data da visita técnica", type: "date" },
      { entity: "deal", label: "Tem financiamento", type: "checkbox" },
      { entity: "contact", label: "Cidade", type: "text", pergunta: "Em que cidade fica o imóvel?" },
    ],
  },
  {
    id: "imobiliaria",
    nome: "Imobiliária",
    descricao: "Compra e aluguel: interesse, tipo de imóvel, bairro, orçamento e visita.",
    icone: "building",
    contexto: "A empresa é uma imobiliária que vende e aluga imóveis.",
    abertura: "Olá! Aqui é a {empresa}. Vou te fazer algumas perguntas para encontrar o imóvel certo para você. Qual é o seu nome?",
    funil: {
      nome: "Funil imobiliário",
      etapas: [
        { name: "Novo lead", type: "open", probability: 10, color: "slate" },
        { name: "Qualificado", type: "open", probability: 25, color: "blue" },
        { name: "Visita agendada", type: "open", probability: 45, color: "violet" },
        { name: "Proposta", type: "open", probability: 70, color: "amber" },
        { name: "Contrato fechado", type: "won", probability: 100 },
        { name: "Perdido", type: "lost", probability: 0 },
      ],
    },
    campos: [
      { entity: "deal", label: "Interesse", type: "select", options: ["Comprar", "Alugar"], showOnCard: true, pergunta: "Você quer comprar ou alugar?" },
      { entity: "deal", label: "Tipo de imóvel", type: "select", options: ["Apartamento", "Casa", "Terreno", "Comercial"], showOnCard: true, pergunta: "Que tipo de imóvel você procura?" },
      { entity: "deal", label: "Bairro de interesse", type: "text", pergunta: "Em qual bairro ou região?" },
      { entity: "deal", label: "Orçamento", type: "currency", pergunta: "Qual é o seu orçamento, em reais?" },
      { entity: "deal", label: "Data da visita", type: "date" },
    ],
  },
  {
    id: "clinica",
    nome: "Clínica e estética",
    descricao: "Agendamento de avaliações e tratamentos, com procedimento de interesse.",
    icone: "heart",
    contexto: "A empresa é uma clínica que atende pacientes por agendamento e vende tratamentos e procedimentos.",
    abertura: "Olá! Aqui é a {empresa}. Vou pegar alguns dados para agendar o seu atendimento. Qual é o seu nome?",
    funil: {
      nome: "Pacientes",
      etapas: [
        { name: "Novo contato", type: "open", probability: 10, color: "slate" },
        { name: "Avaliação agendada", type: "open", probability: 40, color: "blue" },
        { name: "Orçamento enviado", type: "open", probability: 65, color: "violet" },
        { name: "Tratamento fechado", type: "won", probability: 100 },
        { name: "Não fechou", type: "lost", probability: 0 },
      ],
    },
    campos: [
      { entity: "deal", label: "Procedimento de interesse", type: "select", options: ["Avaliação", "Limpeza de pele", "Botox", "Preenchimento", "Depilação a laser", "Outro"], showOnCard: true, pergunta: "Qual procedimento você tem interesse?" },
      { entity: "deal", label: "Data da avaliação", type: "date" },
      { entity: "deal", label: "Valor do tratamento", type: "currency" },
      { entity: "contact", label: "Primeira vez na clínica", type: "checkbox", pergunta: "É a sua primeira vez aqui? (sim ou não)" },
    ],
  },
  {
    id: "varejo",
    nome: "Loja e e-commerce",
    descricao: "Pedidos pelo WhatsApp: produto, pagamento, separação e entrega.",
    icone: "shopping",
    contexto: "A empresa é uma loja que recebe pedidos pelo WhatsApp e entrega os produtos aos clientes.",
    abertura: "Olá! Aqui é a loja {empresa}. Vou anotar o seu pedido. Qual é o seu nome?",
    funil: {
      nome: "Pedidos",
      etapas: [
        { name: "Novo pedido", type: "open", probability: 40, color: "slate" },
        { name: "Aguardando pagamento", type: "open", probability: 60, color: "amber" },
        { name: "Pago", type: "open", probability: 90, color: "emerald" },
        { name: "Enviado", type: "open", probability: 95, color: "cyan" },
        { name: "Entregue", type: "won", probability: 100 },
        { name: "Cancelado", type: "lost", probability: 0 },
      ],
    },
    campos: [
      { entity: "deal", label: "Produto", type: "text", showOnCard: true, pergunta: "Qual produto você quer?" },
      { entity: "deal", label: "Quantidade", type: "number", pergunta: "Quantas unidades?" },
      { entity: "deal", label: "Forma de pagamento", type: "select", options: ["Pix", "Cartão", "Boleto", "Dinheiro"], pergunta: "Como prefere pagar?" },
      { entity: "deal", label: "Código de rastreio", type: "text" },
      { entity: "contact", label: "Endereço de entrega", type: "longtext", pergunta: "Qual é o endereço de entrega?" },
    ],
  },
  {
    id: "servicos",
    nome: "Serviços e consultoria",
    descricao: "Reuniões, propostas e contratos para empresas que vendem projetos ou horas.",
    icone: "briefcase",
    contexto: "A empresa presta serviços e consultoria e fecha contratos depois de reuniões e propostas.",
    abertura: "Olá! Aqui é a {empresa}. Para entender como podemos ajudar, vou fazer duas perguntas rápidas. Qual é o seu nome?",
    funil: { nome: "Contratos", etapas: [
      { name: "Novo contato", type: "open", probability: 10, color: "slate" },
      { name: "Reunião agendada", type: "open", probability: 30, color: "blue" },
      { name: "Proposta enviada", type: "open", probability: 55, color: "violet" },
      { name: "Negociação", type: "open", probability: 75, color: "amber" },
      { name: "Contrato fechado", type: "won", probability: 100 },
      { name: "Perdido", type: "lost", probability: 0 },
    ] },
    campos: [
      { entity: "deal", label: "O que o cliente precisa", type: "longtext", pergunta: "Conte em poucas palavras o que você precisa." },
      { entity: "deal", label: "Orçamento estimado", type: "currency", showOnCard: true, pergunta: "Você tem uma faixa de orçamento em mente? Pode ser um valor aproximado, em reais." },
      { entity: "deal", label: "Prazo desejado", type: "date" },
      { entity: "contact", label: "Empresa do contato", type: "text", pergunta: "Qual é o nome da sua empresa?" },
    ],
  },
  {
    id: "cursos",
    nome: "Escola e cursos",
    descricao: "Matrículas: curso de interesse, turno e aula experimental.",
    icone: "graduation",
    contexto: "A empresa é uma escola ou curso que capta alunos e faz matrículas.",
    abertura: "Olá! Aqui é a {empresa}. Vou te fazer duas perguntas para indicar o melhor curso. Qual é o seu nome?",
    funil: { nome: "Matrículas", etapas: [
      { name: "Interessado", type: "open", probability: 15, color: "slate" },
      { name: "Aula experimental", type: "open", probability: 45, color: "blue" },
      { name: "Proposta de matrícula", type: "open", probability: 70, color: "amber" },
      { name: "Matriculado", type: "won", probability: 100 },
      { name: "Desistiu", type: "lost", probability: 0 },
    ] },
    campos: [
      { entity: "deal", label: "Curso de interesse", type: "text", showOnCard: true, pergunta: "Qual curso te interessa?" },
      { entity: "deal", label: "Turno", type: "select", options: ["Manhã", "Tarde", "Noite"], showOnCard: true, pergunta: "Qual turno é melhor para você?" },
      { entity: "deal", label: "Data da aula experimental", type: "date" },
    ],
  },
  {
    id: "zero",
    nome: "Começar do zero",
    descricao: "Um funil de vendas simples. Você cria os seus campos e etapas do seu jeito.",
    icone: "blank",
    contexto: "A empresa vende produtos ou serviços.",
    abertura: "Olá! Aqui é o atendimento da {empresa}. Qual é o seu nome?",
    funil: { nome: "Vendas", etapas: VENDA_PADRAO },
    campos: [],
  },
];

export const PACOTE_POR_ID = new Map(PACOTES.map((p) => [p.id, p]));
