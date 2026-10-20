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
  return etapas.filter((e) => e.type === "open").flatMap((e) => e.deals.map((d) => ({ d, tipo: e.type, prazo: e.rottingDays })));
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
  const parados = lista.filter((x) => estaParado(x.d, x.tipo, agora, x.prazo) || fechamentoPassou(x.d, agora)).map((x) => x.d);

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

/**
 * O chip do próximo passo dito como gente (variação 2). Recebe o texto curto
 * de sinalDoNegocio e devolve a frase longa; o que não reconhece passa igual.
 */
export function sinalHumano(texto: string, tom: string): string {
  // "Parado há 12d" (cartão) ou "Parado 12 dias" (formato antigo).
  let m = texto.match(/^Parado (?:há )?(\d+)(?:d| dias)$/);
  if (m) return Number(m[1]) >= 14 ? `Quieto há ${m[1]} dias. Que tal ligar?` : `Parado há ${m[1]} dias`;
  m = texto.match(/^Retorno atrasado (\d+)d$/);
  if (m) return m[1] === "1" ? "Retorno era ontem" : `Retorno atrasado há ${m[1]} dias`;
  m = texto.match(/^Fechamento passou (.+)$/);
  if (m) return `Previsão era ${m[1]}. Remarcar?`;
  m = texto.match(/^Ganho (.+)$/);
  if (m && tom === "ok") return `Fechou em ${m[1]}`;
  m = texto.match(/^Fecha (.+)$/);
  if (m) return `Deve fechar ${m[1]}`;
  return texto;
}

/** O que dizer numa coluna vazia, conforme o tipo e a posição da etapa. */
export function vazioDaEtapa(tipo: string, nome: string, anterior: string | null): { titulo: string; dica: string } {
  if (tipo === "won") return { titulo: "A próxima venda aparece aqui.", dica: "Arraste o negócio para cá quando fechar." };
  if (tipo === "lost") return { titulo: "Nenhum negócio perdido.", dica: "Que continue assim." };
  if (!anterior) return { titulo: `Ninguém em ${nome} agora.`, dica: "Use o + para cadastrar um negócio novo." };
  return { titulo: `Caminho livre em ${nome}.`, dica: `Puxe um de ${anterior} quando ele estiver pronto.` };
}

/** Frase da comemoração quando um negócio vira ganho. */
export function comemoracao(
  nome: string,
  valorCents: number,
  vendasNoMes: number
): { titulo: string; detalhe: string } {
  const valor = valorCents > 0 ? `, ${valorCurto(valorCents)}` : "";
  const detalhe =
    vendasNoMes <= 1 ? "Primeira venda do mês. Bom começo." : vendasNoMes === 2 ? "Segunda venda do mês." : `Já são ${vendasNoMes} vendas este mês.`;
  return { titulo: `Fechou! ${nome}${valor}.`, detalhe };
}

// ---- variação 3: o que pede atenção hoje e o que mudou desde ontem ----

export type AcaoDaAtencao = "whatsapp" | "retorno" | "remarcar" | "ligar";

export interface ItemDeAtencao {
  deal: NegocioKanban;
  etapa: string;
  /** Frase do porquê, já com contexto ("R$ 24,8 mil em Qualificação. Quieto há 12 dias."). */
  motivo: string;
  acao: AcaoDaAtencao;
  rotulo: string;
  urgencia: number;
}

/**
 * Os negócios abertos que pedem ação, do mais urgente para o menos, cada um
 * com a ação certa: cliente esperando resposta, retorno vencido, previsão
 * vencida e parado. Um item por negócio, pelo motivo mais forte.
 */
export function listaDeAtencao(etapas: EtapaKanban[], agora: Date): ItemDeAtencao[] {
  const out: ItemDeAtencao[] = [];
  for (const e of etapas) {
    if (e.type !== "open") continue;
    for (const d of e.deals) {
      const onde = `${valorCurto(d.amountCents)} em ${e.name}.`;
      if (d.whatsapp?.naoLida) {
        out.push({ deal: d, etapa: e.name, motivo: `${onde} Mandou mensagem e está esperando você.`, acao: "whatsapp", rotulo: "Responder no WhatsApp", urgencia: 4 });
      } else if (d.nextTask?.dueAt && new Date(d.nextTask.dueAt).getTime() < agora.getTime()) {
        const dias = Math.max(0, Math.floor((agora.getTime() - new Date(d.nextTask.dueAt).getTime()) / DIA));
        const quando = dias === 0 ? "era para hoje" : dias === 1 ? "era para ontem" : `atrasou ${dias} dias`;
        out.push({ deal: d, etapa: e.name, motivo: `${onde} O retorno ${quando}.`, acao: "retorno", rotulo: "Ver o retorno", urgencia: 3 + Math.min(dias, 30) / 100 });
      } else if (fechamentoPassou(d, agora)) {
        out.push({ deal: d, etapa: e.name, motivo: `${onde} A previsão de fechar já passou.`, acao: "remarcar", rotulo: "Remarcar previsão", urgencia: 2 });
      } else if (estaParado(d, e.type, agora, e.rottingDays)) {
        const dias = diasParado(d, agora);
        out.push({ deal: d, etapa: e.name, motivo: `${onde} Quieto há ${dias} dias.`, acao: "ligar", rotulo: "Dar um alô", urgencia: 1 + Math.min(dias, 365) / 1000 });
      }
    }
  }
  // Mais urgente primeiro; no empate, o de maior valor.
  return out.sort((a, b) => b.urgencia - a.urgencia || b.deal.amountCents - a.deal.amountCents);
}

export interface Acontecimento {
  id: string;
  quando: string;
  partes: { texto: string; forte?: boolean; tom?: "ok" }[];
  em: number;
}

function quandoRelativo(iso: string, agora: Date): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: FUSO });
  if (dia === agora.toLocaleDateString("sv-SE", { timeZone: FUSO })) {
    const [h, m] = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
    return `${Number(h)}h${m}`;
  }
  return "Ontem";
}

/**
 * O que mudou nas últimas 36h, só com o que o quadro já sabe: vendas,
 * perdas, negócios novos, mudanças de etapa e mensagens sem resposta.
 */
export function desdeOntem(etapas: EtapaKanban[], agora: Date, max = 6): Acontecimento[] {
  const limite = agora.getTime() - 36 * 3_600_000;
  const recente = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= limite && new Date(iso).getTime() <= agora.getTime();
  const out: Acontecimento[] = [];
  for (const e of etapas) {
    for (const d of e.deals) {
      const nome = nomeDoNegocio(d);
      if (e.type === "won" && recente(d.closedAt)) {
        out.push({ id: `g${d.id}`, em: Date.parse(d.closedAt!), quando: quandoRelativo(d.closedAt!, agora), partes: [{ texto: `${nome} fechou`, forte: true, tom: "ok" }, { texto: d.amountCents ? ` ${valorCurto(d.amountCents)}.` : "." }] });
      } else if (e.type === "lost" && recente(d.closedAt)) {
        out.push({ id: `p${d.id}`, em: Date.parse(d.closedAt!), quando: quandoRelativo(d.closedAt!, agora), partes: [{ texto: nome, forte: true }, { texto: " saiu do funil como perdido." }] });
      } else if (recente(d.createdAt) && Math.abs(Date.parse(d.createdAt) - Date.parse(d.stageSince)) < 60_000) {
        out.push({ id: `n${d.id}`, em: Date.parse(d.createdAt), quando: quandoRelativo(d.createdAt, agora), partes: [{ texto: "Negócio novo: " }, { texto: nome, forte: true }, { texto: ` em ${e.name}.` }] });
      } else if (e.type === "open" && recente(d.stageSince)) {
        out.push({ id: `e${d.id}`, em: Date.parse(d.stageSince), quando: quandoRelativo(d.stageSince, agora), partes: [{ texto: nome, forte: true }, { texto: ` foi para ${e.name}.` }] });
      }
      if (e.type === "open" && d.whatsapp?.naoLida) {
        out.push({ id: `w${d.id}`, em: agora.getTime() - 1, quando: "Agora", partes: [{ texto: nome, forte: true }, { texto: " mandou mensagem no WhatsApp." }] });
      }
    }
  }
  return out.sort((a, b) => b.em - a.em).slice(0, max);
}
