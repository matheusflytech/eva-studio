import { diasParado, estaParado, fechamentoPassou, valorCurto, type EtapaKanban, type NegocioKanban } from "./modelo";

/**
 * A voz da Eva no topo de Negócios: o que dizer, em primeira pessoa e com
 * número de verdade, a partir do funil carregado. Tudo puro para testar o
 * texto sem tela: a frase errada aqui é o que faz o produto parecer robô.
 */

const FUSO = "America/Sao_Paulo";
const DIA = 86_400_000;

function horaSP(agora: Date): number {
  return Number(agora.toLocaleString("en-US", { timeZone: FUSO, hour: "numeric", hour12: false })) % 24;
}

export function saudacao(agora: Date): string {
  const h = horaSP(agora);
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça, 20 de outubro, 9h12" no fuso de São Paulo. */
export function carimbo(agora: Date): string {
  const dia = agora.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" });
  const [h, m] = agora.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
  return `${dia}, ${Number(h)}h${m}`;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/** Lista humana: "A", "A e B", "A, B e C" (e "mais N" além de três). */
export function listaHumana(nomes: string[], max = 3): string {
  const vistos = [...new Set(nomes.filter(Boolean))];
  if (vistos.length === 0) return "";
  const mostra = vistos.slice(0, max);
  const resto = vistos.length - mostra.length;
  if (resto > 0) return `${mostra.join(", ")} e mais ${resto}`;
  if (mostra.length === 1) return mostra[0];
  return `${mostra.slice(0, -1).join(", ")} e ${mostra[mostra.length - 1]}`;
}

export type AcaoDoRecado = "retornos" | "naoLidas" | "atencao" | "gargalo" | "novo";

export interface Recado {
  titulo: string;
  /** Frases do corpo; `forte` vira negrito. */
  partes: { texto: string; forte?: boolean }[];
  acoes: { id: AcaoDoRecado; rotulo: string }[];
}

interface Gargalo {
  de: string;
  para: string;
  taxa: number;
}

const nomeDoNegocio = (n: NegocioKanban) => n.company?.name || n.contacts[0]?.name || n.name;

function abertos(etapas: EtapaKanban[]) {
  return etapas.filter((e) => e.type === "open").flatMap((e) => e.deals.map((d) => ({ d, tipo: e.type })));
}

function retornoVencido(n: NegocioKanban, agora: Date): boolean {
  return !!n.nextTask?.dueAt && new Date(n.nextTask.dueAt).getTime() < agora.getTime() + DIA / 2;
}

/**
 * Escolhe UMA prioridade para o título (a coisa que mais rende fazer agora)
 * e completa com o contexto do funil. Ordem: cliente esperando resposta,
 * retornos vencendo, negócios parados, e só então o resumo do funil.
 */
export function montarRecado(
  etapas: EtapaKanban[],
  agora: Date,
  nome: string,
  gargalo: Gargalo | null
): Recado {
  const ola = `${saudacao(agora)}${primeiroNome(nome) ? `, ${primeiroNome(nome)}` : ""}.`;
  const lista = abertos(etapas);
  const totalCents = lista.reduce((s, x) => s + x.d.amountCents, 0);
  const naoLidas = lista.filter((x) => x.d.whatsapp?.naoLida).map((x) => x.d);
  const retornos = lista.filter((x) => retornoVencido(x.d, agora)).map((x) => x.d);
  const parados = lista.filter((x) => estaParado(x.d, x.tipo, agora) || fechamentoPassou(x.d, agora)).map((x) => x.d);

  if (lista.length === 0) {
    return {
      titulo: `${ola} O funil está vazio por enquanto.`,
      partes: [{ texto: "Assim que o primeiro negócio entrar eu acompanho com você: quem pediu retorno, quem esfriou e onde o funil trava." }],
      acoes: [{ id: "novo", rotulo: "Criar o primeiro negócio" }],
    };
  }

  const partes: Recado["partes"] = [
    { texto: "Você tem " },
    { texto: `${valorCurto(totalCents)} na mesa`, forte: true },
    { texto: ` em ${lista.length} ${lista.length === 1 ? "negócio" : "negócios"}. ` },
  ];
  const acoes: Recado["acoes"] = [];
  let titulo: string;

  if (naoLidas.length > 0) {
    const n = naoLidas.length;
    titulo = `${ola} ${n === 1 ? "Tem 1 cliente esperando" : `Tem ${n} clientes esperando`} sua resposta.`;
    partes.push({ texto: `${listaHumana(naoLidas.map(nomeDoNegocio))} ${n === 1 ? "mandou" : "mandaram"} mensagem e ninguém respondeu ainda. ` });
    acoes.push({ id: "naoLidas", rotulo: n === 1 ? "Responder agora" : `Ver as ${n} conversas` });
  } else if (retornos.length > 0) {
    // Conta quem, não quantas tarefas: duas tarefas da mesma empresa são uma ligação.
    const quem = [...new Set(retornos.map(nomeDoNegocio))];
    const n = quem.length;
    titulo = `${ola} Hoje o que mais rende é falar com ${n === 1 ? "1 cliente" : `${n} clientes`}.`;
    partes.push({ texto: `${listaHumana(quem)} ${n === 1 ? "está" : "estão"} com retorno para hoje ou já atrasado. ` });
    acoes.push({ id: "retornos", rotulo: retornos.length === 1 ? "Ver o retorno" : `Ver os ${retornos.length} retornos` });
  } else if (parados.length > 0) {
    const n = parados.length;
    const maisAntigo = [...parados].sort((a, b) => diasParado(b, agora) - diasParado(a, agora))[0];
    titulo = `${ola} ${n === 1 ? "Um negócio esfriou" : `${n} negócios esfriaram`} e merecem um alô.`;
    partes.push({ texto: `O mais antigo é ${nomeDoNegocio(maisAntigo)}, quieto há ${diasParado(maisAntigo, agora)} dias. ` });
    acoes.push({ id: "atencao", rotulo: n === 1 ? "Ver qual é" : `Ver os ${n}` });
  } else {
    titulo = `${ola} Tudo em dia por aqui.`;
    partes.push({ texto: "Ninguém esperando resposta e nenhum negócio parado. " });
  }

  if (gargalo && gargalo.taxa < 0.75) {
    partes.push({ texto: "De " }, { texto: gargalo.de, forte: true }, { texto: " para " }, { texto: gargalo.para, forte: true });
    partes.push({ texto: ` só ${Math.round(gargalo.taxa * 100)}% avançam: é onde o funil mais trava.` });
    acoes.push({ id: "gargalo", rotulo: `Ver quem está em ${gargalo.de}` });
  }
  return { titulo, partes, acoes };
}

/**
 * Pequenas conquistas para mostrar como "momentos". Só fatos verificáveis no
 * funil carregado; nada inventado. Até 3, da mais forte para a mais fraca.
 */
export function momentos(etapas: EtapaKanban[], agora: Date): string[] {
  const ganhos = etapas.filter((e) => e.type === "won").flatMap((e) => e.deals).filter((d) => d.closedAt);
  const perdidos = etapas.filter((e) => e.type === "lost").flatMap((e) => e.deals).filter((d) => d.closedAt);
  const t = agora.getTime();
  const naSemana = ganhos.filter((d) => t - new Date(d.closedAt!).getTime() < 7 * DIA);
  const perdasNaSemana = perdidos.filter((d) => t - new Date(d.closedAt!).getTime() < 7 * DIA);
  const out: string[] = [];

  if (naSemana.length >= 2 && perdasNaSemana.length === 0) out.push(`${naSemana.length} vendas na semana sem perder nenhum negócio`);
  else if (naSemana.length >= 1) out.push(`${naSemana.length === 1 ? "1 venda" : `${naSemana.length} vendas`} nos últimos 7 dias`);

  const maior = [...naSemana].sort((a, b) => b.amountCents - a.amountCents)[0];
  if (maior && maior.amountCents > 0) out.push(`Maior venda da semana: ${nomeDoNegocio(maior)}, ${valorCurto(maior.amountCents)}`);

  const hoje = ganhos.filter((d) => new Date(d.closedAt!).toLocaleDateString("sv-SE", { timeZone: FUSO }) === agora.toLocaleDateString("sv-SE", { timeZone: FUSO }));
  if (hoje.length > 0) out.unshift(hoje.length === 1 ? "Já teve venda hoje" : `${hoje.length} vendas hoje`);

  return out.slice(0, 3);
}

/** Maior queda entre etapas vizinhas da conversão; null sem queda relevante. */
export function gargaloDaConversao(
  conversao: { nome: string; quantidade: number }[]
): { de: string; para: string; taxa: number } | null {
  let pior: { de: string; para: string; taxa: number } | null = null;
  for (let i = 1; i < conversao.length; i++) {
    const antes = conversao[i - 1].quantidade;
    if (antes === 0) continue;
    const taxa = conversao[i].quantidade / antes;
    if (taxa < 0.95 && (!pior || taxa < pior.taxa)) pior = { de: conversao[i - 1].nome, para: conversao[i].nome, taxa };
  }
  return pior;
}
