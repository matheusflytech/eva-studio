// ---------------------------------------------------------------------------
// Template de mensagem da Meta (WhatsApp Cloud API): formulário → payload.
//
// Puro (sem servidor, sem fetch): a tela usa pra validar e mostrar a prévia
// enquanto a pessoa digita, e a rota usa as MESMAS funções antes de mandar pra
// Graph — o que a tela aprovou é exatamente o que vai pra Meta.
//
// Variáveis: a Meta só entende posicional ({{1}}, {{2}}...). Aqui aceitamos
// também {nome} e {{nome}} — o jeito como o resto do app já escreve variável
// — e convertemos na ordem em que aparecem. A chave original fica guardada no
// modelo local (variableOrder), que é o que o envio usa pra preencher cada
// posição com o dado do contato.
// ---------------------------------------------------------------------------

export const LIMITES = {
  nome: 512,
  corpo: 1024,
  header: 60,
  rodape: 60,
  textoBotao: 25,
  url: 2000,
  telefone: 20,
  botoes: 10,
  respostasRapidas: 10,
  urls: 2,
  telefones: 1,
} as const;

export type CategoriaTemplate = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type FormatoHeader = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export const CATEGORIAS: { valor: CategoriaTemplate; rotulo: string; dica: string }[] = [
  { valor: "MARKETING", rotulo: "Marketing", dica: "Promoção, novidade, convite, recuperação de carrinho." },
  { valor: "UTILITY", rotulo: "Utilidade", dica: "Sobre algo que o cliente já fez: pedido, agendamento, cobrança." },
  { valor: "AUTHENTICATION", rotulo: "Autenticação", dica: "Código de verificação (texto fixo da Meta)." },
];

export interface BotaoTemplate {
  tipo: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  texto: string;
  url?: string;
  /** URL completa de exemplo, obrigatória quando a URL tem variável. */
  exemploUrl?: string;
  telefone?: string;
}

export interface FormularioTemplate {
  nome: string;
  categoria: CategoriaTemplate;
  idioma: string;
  header: { formato: FormatoHeader; texto?: string; exemplo?: string; handle?: string; nomeArquivo?: string };
  corpo: string;
  /** Exemplo de cada variável do corpo, pela chave ("1", "nome"...). */
  exemplos: Record<string, string>;
  /** Variável numérica → campo do contato que a preenche no envio. */
  mapa?: Record<string, string>;
  rodape?: string;
  botoes: BotaoTemplate[];
  /** Só AUTHENTICATION: validade do código, em minutos (1 a 90). */
  validadeCodigoMin?: number;
}

export function formularioVazio(): FormularioTemplate {
  return {
    nome: "",
    categoria: "MARKETING",
    idioma: "pt_BR",
    header: { formato: "NONE" },
    corpo: "",
    exemplos: {},
    mapa: {},
    rodape: "",
    botoes: [],
  };
}

// ---------------------------------------------------------------------------
// Variáveis
// ---------------------------------------------------------------------------

// {{1}}, {{ 1 }}, {{nome}} ou {nome}. {1} (chave simples numérica) não é
// variável: é texto comum tipo "passo {1}".
const VARIAVEL = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function normalizarVariaveis(texto: string): { texto: string; chaves: string[] } {
  const chaves: string[] = [];
  const saida = (texto ?? "").replace(VARIAVEL, (_, dupla?: string, simples?: string) => {
    const chave = (dupla ?? simples)!;
    let pos = chaves.indexOf(chave);
    if (pos === -1) {
      chaves.push(chave);
      pos = chaves.length - 1;
    }
    return `{{${pos + 1}}}`;
  });
  return { texto: saida, chaves };
}

function trocarVariaveis(texto: string, valor: (chave: string) => string): string {
  return (texto ?? "").replace(VARIAVEL, (_, dupla?: string, simples?: string) => valor((dupla ?? simples)!));
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export type CampoDoTemplate =
  | "nome" | "idioma" | "categoria" | "header" | "corpo" | "exemplos" | "rodape" | "botoes" | "validadeCodigoMin";

export interface ErroDeTemplate {
  campo: CampoDoTemplate;
  mensagem: string;
}

const NOME = /^[a-z0-9_]+$/;
const IDIOMA = /^[a-z]{2,3}(_[A-Z]{2})?$/;

function urlValida(url: string): boolean {
  try {
    const u = new URL(url.replace(VARIAVEL, "x"));
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function apenasDigitos(telefone: string): string {
  return (telefone ?? "").replace(/\D/g, "");
}

export function validarTemplate(f: FormularioTemplate): ErroDeTemplate[] {
  const erros: ErroDeTemplate[] = [];
  const erro = (campo: CampoDoTemplate, mensagem: string) => erros.push({ campo, mensagem });

  const nome = f.nome ?? "";
  if (!nome) erro("nome", "Dê um nome ao template.");
  else if (!NOME.test(nome)) erro("nome", "Use só letras minúsculas, números e _ (ex.: lembrete_consulta). Sem espaço, acento ou hífen.");
  else if (nome.length > LIMITES.nome) erro("nome", `O nome pode ter até ${LIMITES.nome} caracteres.`);

  if (!IDIOMA.test(f.idioma ?? "")) erro("idioma", "Idioma no formato da Meta, como pt_BR ou en_US.");
  if (!CATEGORIAS.some((c) => c.valor === f.categoria)) erro("categoria", "Escolha a categoria.");

  if (f.categoria === "AUTHENTICATION") {
    const v = f.validadeCodigoMin;
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1 || v > 90)) {
      erro("validadeCodigoMin", "A validade do código vai de 1 a 90 minutos.");
    }
    return erros;
  }

  // Header
  const h = f.header ?? { formato: "NONE" };
  if (h.formato === "TEXT") {
    const { texto, chaves } = normalizarVariaveis(h.texto ?? "");
    if (!texto.trim()) erro("header", "Escreva o título ou tire o cabeçalho.");
    else if (texto.length > LIMITES.header) erro("header", `O título pode ter até ${LIMITES.header} caracteres.`);
    if (chaves.length > 1) erro("header", "O título aceita uma variável só.");
    else if (chaves.length === 1 && !h.exemplo?.trim()) erro("header", "Dê um exemplo para a variável do título.");
  } else if (h.formato !== "NONE" && !h.handle) {
    erro("header", "Envie um arquivo de exemplo para o cabeçalho (a Meta exige para revisar).");
  }

  // Corpo
  const corpo = normalizarVariaveis(f.corpo ?? "");
  const limpo = corpo.texto.trim();
  if (!limpo) erro("corpo", "Escreva a mensagem.");
  else if (corpo.texto.length > LIMITES.corpo) erro("corpo", `A mensagem pode ter até ${LIMITES.corpo} caracteres.`);
  if (limpo && (/^\{\{\d+\}\}/.test(limpo) || /\{\{\d+\}\}$/.test(limpo))) {
    erro("corpo", "A Meta recusa mensagem que começa ou termina com variável. Coloque um texto antes/depois.");
  }
  corpo.chaves.forEach((chave, i) => {
    if (!f.exemplos?.[chave]?.trim()) erro("exemplos", `Falta o exemplo da variável {{${i + 1}}} (${chave}).`);
  });

  // Rodapé
  const rodape = f.rodape ?? "";
  if (rodape.length > LIMITES.rodape) erro("rodape", `O rodapé pode ter até ${LIMITES.rodape} caracteres.`);
  if (normalizarVariaveis(rodape).chaves.length > 0) erro("rodape", "O rodapé não aceita variável.");

  // Botões
  const botoes = f.botoes ?? [];
  const conta = (t: BotaoTemplate["tipo"]) => botoes.filter((b) => b.tipo === t).length;
  if (botoes.length > LIMITES.botoes) erro("botoes", `Até ${LIMITES.botoes} botões no total.`);
  if (conta("QUICK_REPLY") > LIMITES.respostasRapidas) erro("botoes", `Até ${LIMITES.respostasRapidas} respostas rápidas.`);
  if (conta("URL") > LIMITES.urls) erro("botoes", `Até ${LIMITES.urls} botões de link.`);
  if (conta("PHONE_NUMBER") > LIMITES.telefones) erro("botoes", `Só ${LIMITES.telefones} botão de ligar.`);

  botoes.forEach((b, i) => {
    const n = `Botão ${i + 1}`;
    const texto = (b.texto ?? "").trim();
    if (!texto) erro("botoes", `${n}: escreva o texto do botão.`);
    else if (texto.length > LIMITES.textoBotao) erro("botoes", `${n}: o texto pode ter até ${LIMITES.textoBotao} caracteres.`);

    if (b.tipo === "URL") {
      const url = (b.url ?? "").trim();
      const vars = normalizarVariaveis(url);
      if (!urlValida(url)) erro("botoes", `${n}: link inválido (comece com https://).`);
      else if (url.length > LIMITES.url) erro("botoes", `${n}: o link pode ter até ${LIMITES.url} caracteres.`);
      if (vars.chaves.length > 1) erro("botoes", `${n}: o link aceita uma variável só.`);
      else if (vars.chaves.length === 1) {
        if (!/\{\{1\}\}$/.test(vars.texto)) erro("botoes", `${n}: a variável do link precisa ficar no final.`);
        if (!b.exemploUrl?.trim() || !urlValida(b.exemploUrl)) {
          erro("botoes", `${n}: dê um link completo de exemplo (como ficaria preenchido).`);
        }
      }
    }

    if (b.tipo === "PHONE_NUMBER") {
      const digitos = apenasDigitos(b.telefone ?? "");
      if (digitos.length < 10 || /[^\d\s()+-]/.test(b.telefone ?? "")) {
        erro("botoes", `${n}: telefone com DDI e DDD, ex.: +55 11 99999-8888.`);
      } else if (digitos.length + 1 > LIMITES.telefone) {
        erro("botoes", `${n}: telefone longo demais.`);
      }
    }
  });

  return erros;
}

// ---------------------------------------------------------------------------
// Payload da Graph (POST /{WABA_ID}/message_templates)
// ---------------------------------------------------------------------------

export type ComponenteMeta = Record<string, unknown> & { type: string };

export interface PayloadTemplateMeta {
  name: string;
  language: string;
  category: CategoriaTemplate;
  components: ComponenteMeta[];
}

export function montarPayloadTemplate(f: FormularioTemplate): PayloadTemplateMeta {
  const base = { name: f.nome, language: f.idioma, category: f.categoria };

  if (f.categoria === "AUTHENTICATION") {
    const components: ComponenteMeta[] = [{ type: "BODY", add_security_recommendation: true }];
    if (f.validadeCodigoMin) components.push({ type: "FOOTER", code_expiration_minutes: f.validadeCodigoMin });
    components.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] });
    return { ...base, components };
  }

  const components: ComponenteMeta[] = [];

  const h = f.header ?? { formato: "NONE" };
  if (h.formato === "TEXT") {
    const { texto, chaves } = normalizarVariaveis((h.texto ?? "").trim());
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: texto,
      ...(chaves.length ? { example: { header_text: [h.exemplo?.trim() ?? ""] } } : {}),
    });
  } else if (h.formato !== "NONE") {
    components.push({ type: "HEADER", format: h.formato, example: { header_handle: [h.handle ?? ""] } });
  }

  const corpo = normalizarVariaveis((f.corpo ?? "").trim());
  components.push({
    type: "BODY",
    text: corpo.texto,
    ...(corpo.chaves.length
      ? { example: { body_text: [corpo.chaves.map((c) => f.exemplos?.[c]?.trim() ?? "")] } }
      : {}),
  });

  const rodape = (f.rodape ?? "").trim();
  if (rodape) components.push({ type: "FOOTER", text: rodape });

  // A Meta exige botões agrupados: respostas rápidas juntas e ações juntas.
  const botoes = [...(f.botoes ?? [])].sort(
    (a, b) => Number(a.tipo !== "QUICK_REPLY") - Number(b.tipo !== "QUICK_REPLY")
  );
  if (botoes.length) {
    components.push({
      type: "BUTTONS",
      buttons: botoes.map((b) => {
        const text = b.texto.trim();
        if (b.tipo === "URL") {
          const { texto: url, chaves } = normalizarVariaveis((b.url ?? "").trim());
          return { type: "URL", text, url, ...(chaves.length ? { example: [b.exemploUrl?.trim() ?? ""] } : {}) };
        }
        if (b.tipo === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text, phone_number: `+${apenasDigitos(b.telefone ?? "")}` };
        return { type: "QUICK_REPLY", text };
      }),
    });
  }

  return { ...base, components };
}

// ---------------------------------------------------------------------------
// Prévia (balão estilo WhatsApp)
// ---------------------------------------------------------------------------

export interface PreviaTemplate {
  header: { formato: FormatoHeader; texto?: string; nomeArquivo?: string } | null;
  corpo: string;
  rodape: string;
  botoes: { tipo: BotaoTemplate["tipo"] | "OTP"; texto: string }[];
}

export function previaTemplate(f: FormularioTemplate): PreviaTemplate {
  if (f.categoria === "AUTHENTICATION") {
    return {
      header: null,
      corpo: "*123456* é seu código de verificação. Para sua segurança, não o compartilhe.",
      rodape: f.validadeCodigoMin ? `Este código expira em ${f.validadeCodigoMin} minutos.` : "",
      botoes: [{ tipo: "OTP", texto: "Copiar código" }],
    };
  }

  const h = f.header ?? { formato: "NONE" };
  const header =
    h.formato === "NONE"
      ? null
      : h.formato === "TEXT"
        ? { formato: h.formato, texto: trocarVariaveis(h.texto ?? "", (c) => h.exemplo?.trim() || `[${c}]`) }
        : { formato: h.formato, nomeArquivo: h.nomeArquivo };

  return {
    header,
    corpo: trocarVariaveis(f.corpo ?? "", (c) => f.exemplos?.[c]?.trim() || `[${c}]`),
    rodape: (f.rodape ?? "").trim(),
    botoes: [...(f.botoes ?? [])]
      .sort((a, b) => Number(a.tipo !== "QUICK_REPLY") - Number(b.tipo !== "QUICK_REPLY"))
      .map((b) => ({ tipo: b.tipo, texto: b.texto.trim() || "Botão" })),
  };
}

// ---------------------------------------------------------------------------
// Modelo local (MessageTemplate) que o envio usa
// ---------------------------------------------------------------------------

/**
 * Corpo no formato do app ({campo}) e a ordem das variáveis — o runner de
 * disparo e o motor de fluxo montam os parâmetros {{1}}, {{2}}... nessa ordem.
 */
export function modeloLocal(f: FormularioTemplate): { bodyText: string; variableOrder: string[] } {
  const { chaves } = normalizarVariaveis(f.corpo ?? "");
  const campo = (c: string) => f.mapa?.[c]?.trim() || c;
  return {
    bodyText: trocarVariaveis((f.corpo ?? "").trim(), (c) => `{${campo(c)}}`),
    variableOrder: chaves.map(campo),
  };
}
