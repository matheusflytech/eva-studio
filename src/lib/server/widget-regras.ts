// Regras puras (sem banco) que classificam o texto de um visitante do widget ANTES de gastar IA.
// Detectam tentativa de manipular o agente (prompt injection), pedido de dados internos, código
// malicioso, spam, texto sem sentido e abuso. Cada sinal soma pontos; a partir de 2 a mensagem é
// bloqueada sem chamar a IA. Mantido sem importações para poder ser testado isoladamente.

export type TipoAmeaca = "injecao" | "spam" | "abuso" | "lixo";

export interface Analise {
  pontos: number;
  tipo: TipoAmeaca | null;
  sinais: string[];
}

export const PONTOS_PARA_BLOQUEAR = 2;

// minúsculas, sem acento, sem caracteres invisíveis usados para disfarçar palavras
function normaliza(t: string): string {
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[​-‏⁠﻿­]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Regra { id: string; re: RegExp; pontos: number; tipo: TipoAmeaca }

const REGRAS: Regra[] = [
  // ---- tentativa de manipular o agente ----
  { id: "ignorar-instrucoes", tipo: "injecao", pontos: 2, re: /\b(ignore|ignora|ignorar|desconsidere|desconsiderar|esqueca|esquecer|disregard|forget|olvida|omite)\b.{0,50}\b(instruc|instruct|regras|rules|prompt|anteriores|previous|above|acima|todo o resto|everything)/ },
  { id: "revelar-prompt", tipo: "injecao", pontos: 2, re: /\b(revele|revelar|mostre|mostrar|exiba|imprima|repita|liste|show|reveal|print|repeat|dime|muestra|muestrame)\b.{0,50}\b(prompt|instruc|system|sistema|configurac|regras internas|suas regras)/ },
  { id: "prompt-sistema", tipo: "injecao", pontos: 2, re: /\b(system prompt|prompt do sistema|prompt de sistema|developer message|mensagem do sistema|initial instructions|instrucoes iniciais)\b/ },
  { id: "jailbreak", tipo: "injecao", pontos: 2, re: /\b(jailbreak|dan mode|do anything now|modo desenvolvedor|developer mode|modo deus|god mode|sem restricoes|no restrictions)\b/ },
  { id: "troca-de-papel", tipo: "injecao", pontos: 1, re: /\b(a partir de agora|from now on|desde ahora)\b.{0,40}\b(voce|you|tu)\b.{0,30}\b(e|eh|are|eres|vai|will|sera|ira)\b/ },
  { id: "finja", tipo: "injecao", pontos: 1, re: /\b(finja|finge|pretend|act as|aja como|actua como|haz de cuenta|simule que)\b/ },
  { id: "dados-internos", tipo: "injecao", pontos: 2, re: /\b(revele|mostre|me d[eê]|liste|exiba|show|give me|dame|dime|vaze)\b.{0,50}\b(api[ _-]?key|chave de api|token|senha|password|credenciais|credentials|variaveis de ambiente|environment variables|database_url|connection string|\.env)\b/ },
  { id: "dados-internos-solto", tipo: "injecao", pontos: 1, re: /\b(api[ _-]?key|variaveis de ambiente|environment variables|database_url|connection string|\.env)\b/ },
  { id: "codigo", tipo: "injecao", pontos: 2, re: /<\s*script|javascript:|onerror\s*=|onload\s*=|union\s+select|drop\s+table|;\s*--|\$\{[^}]{0,60}\}|\{\{[^}]{0,60}\}\}|<\/?\s*(iframe|svg|object|embed)\b/ },
  { id: "comando", tipo: "injecao", pontos: 2, re: /\b(execute (o )?comando|run (the )?command|rm -rf|curl\s+https?|wget\s+https?|powershell|cmd\.exe|bash -c|chmod \d{3})\b/ },
  // ---- spam ----
  { id: "palavras-de-spam", tipo: "spam", pontos: 1, re: /\b(bitcoin|cripto(moeda)?s?|forex|trading|investimento garantido|renda extra|ganhe dinheiro|casino|cassino|apostas?|viagra|cialis|backlinks?|comprar seguidores|buy followers|emprestimo rapido|click here|clique aqui|onlyfans|porn|xxx|sorteio|giveaway|promocao imperdivel)\b/ },
  { id: "caractere-repetido", tipo: "spam", pontos: 2, re: /(.)\1{14,}/ },
  // ---- abuso ----
  { id: "ameaca", tipo: "abuso", pontos: 2, re: /\b(vou (te )?(matar|destruir|processar voces todos)|derrubar (o )?(site|servidor)|invadir (o )?(site|servidor|sistema|banco)|hackear (voces|o site|o sistema))\b/ },
  { id: "xingamento", tipo: "abuso", pontos: 1, re: /\b(porra|caralho|puta que|fdp|filho da puta|vai se f|arrombado|babaca|idiota|imbecil|merda|fuck|shit|asshole|mierda|hijo de puta)\b/g }
];

const URL_RE = /(https?:\/\/|www\.)\S+/g;
const FONE_RE = /(?:\+?\d{2}[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/;

export function analisarTexto(original: string): Analise {
  const sinais: string[] = [];
  const porTipo: Record<TipoAmeaca, number> = { injecao: 0, spam: 0, abuso: 0, lixo: 0 };
  const soma = (id: string, tipo: TipoAmeaca, pontos: number) => { sinais.push(id); porTipo[tipo] += pontos; };

  const texto = normaliza(original);
  if (!texto) return { pontos: 0, tipo: null, sinais };

  for (const r of REGRAS) {
    r.re.lastIndex = 0;
    if (r.id === "xingamento") {
      const achados = texto.match(r.re) || [];
      if (achados.length >= 2) soma(r.id, r.tipo, 2); else if (achados.length === 1) soma(r.id, r.tipo, 1);
      continue;
    }
    if (r.re.test(texto)) soma(r.id, r.tipo, r.pontos);
  }

  // links e telefones em excesso, ou propaganda com link
  const urls = texto.match(URL_RE) || [];
  if (urls.length >= 3) soma("muitos-links", "spam", 2);
  else if (urls.length >= 1 && porTipo.spam >= 1) soma("propaganda-com-link", "spam", 1);
  if (urls.length >= 1 && FONE_RE.test(texto) && porTipo.spam >= 1) soma("propaganda-com-telefone", "spam", 1);

  // a mesma palavra repetida muitas vezes
  const palavras = texto.split(" ").filter((p) => p.length >= 3);
  if (palavras.length >= 12) {
    const cont = new Map<string, number>();
    for (const p of palavras) cont.set(p, (cont.get(p) || 0) + 1);
    const max = Math.max(...cont.values());
    if (max >= 8 && max / palavras.length > 0.45) soma("palavra-repetida", "spam", 2);
  }

  // texto sem sentido: sequência longa sem espaço, base64, quase sem vogais
  if (texto.length >= 25 && !texto.includes(" ")) soma("sem-espacos", "lixo", 2);
  if (/[a-z0-9+/=]{60,}/.test(texto)) soma("base64", "lixo", 2);
  const letras = texto.replace(/[^a-z]/g, "");
  if (letras.length >= 30) {
    const vogais = (letras.match(/[aeiou]/g) || []).length;
    if (vogais / letras.length < 0.12) soma("sem-vogais", "lixo", 2);
  }
  const maiusculas = (original.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g) || []).length;
  const todasLetras = (original.match(/[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]/g) || []).length;
  if (todasLetras >= 40 && maiusculas / todasLetras > 0.8) soma("so-maiusculas", "spam", 1);

  const pontos = porTipo.injecao + porTipo.spam + porTipo.abuso + porTipo.lixo;
  let tipo: TipoAmeaca | null = null;
  let melhor = 0;
  (Object.keys(porTipo) as TipoAmeaca[]).forEach((t) => { if (porTipo[t] > melhor) { melhor = porTipo[t]; tipo = t; } });
  return { pontos, tipo: pontos >= 1 ? tipo : null, sinais };
}

export function bloqueia(a: Analise): boolean {
  return a.pontos >= PONTOS_PARA_BLOQUEAR;
}

type Idioma = "pt" | "en" | "es";
function idioma(lang?: string): Idioma {
  const l = (lang || "pt").slice(0, 2).toLowerCase();
  return l === "en" || l === "es" ? l : "pt";
}

const MSG = {
  recusa: {
    pt: "Não consigo ajudar com esse tipo de pedido. Posso falar sobre sites, agentes de IA, infraestrutura e automações da Eva Holding. O que você precisa?",
    en: "I can't help with that kind of request. I can talk about Eva Holding's websites, AI agents, infrastructure and automation. What do you need?",
    es: "No puedo ayudar con ese tipo de pedido. Puedo hablar sobre los sitios, agentes de IA, infraestructura y automatizaciones de Eva Holding. ¿Qué necesitas?"
  },
  repetida: {
    pt: "Você já me enviou essa mensagem. Se quiser, reformule ou conte um pouco mais sobre o que precisa.",
    en: "You already sent me that message. If you like, rephrase it or tell me a bit more about what you need.",
    es: "Ya me enviaste ese mensaje. Si quieres, reformúlalo o cuéntame un poco más sobre lo que necesitas."
  },
  bloqueado: {
    pt: "Recebemos muitas mensagens seguidas por aqui. Para continuar, fale direto com a nossa equipe pelo WhatsApp ou tente novamente mais tarde.",
    en: "We received too many messages in a row. To continue, talk to our team directly on WhatsApp or try again later.",
    es: "Recibimos demasiados mensajes seguidos. Para continuar, habla directamente con nuestro equipo por WhatsApp o inténtalo más tarde."
  },
  limite: {
    pt: "Você atingiu o limite de mensagens por agora. Aguarde um pouco ou fale direto com a nossa equipe pelo WhatsApp.",
    en: "You've reached the message limit for now. Please wait a bit or talk to our team directly on WhatsApp.",
    es: "Alcanzaste el límite de mensajes por ahora. Espera un poco o habla directamente con nuestro equipo por WhatsApp."
  },
  audioGrande: {
    pt: "Esse áudio ficou longo demais. Pode mandar um mais curto, de até 1 minuto, ou escrever?",
    en: "That audio is too long. Could you send a shorter one, up to 1 minute, or type it?",
    es: "Ese audio es demasiado largo. ¿Puedes enviar uno más corto, de hasta 1 minuto, o escribirlo?"
  },
  indisponivel: {
    pt: "O atendimento está com muita procura agora. Tente novamente em alguns minutos ou fale com a nossa equipe pelo WhatsApp.",
    en: "Support is very busy right now. Try again in a few minutes or talk to our team on WhatsApp.",
    es: "La atención tiene mucha demanda ahora. Inténtalo de nuevo en unos minutos o habla con nuestro equipo por WhatsApp."
  }
} as const;

export function mensagem(chave: keyof typeof MSG, lang?: string): string {
  return MSG[chave][idioma(lang)];
}
