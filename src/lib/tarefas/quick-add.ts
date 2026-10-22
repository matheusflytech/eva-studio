import { diaDaSemana, diaEmSP, noDia, proximoDiaDaSemana, somarDias, type Dia } from "./calendario";
import type { Prioridade, TipoDeTarefa } from "./tipos";

// ---------------------------------------------------------------------------
// Quick add em linguagem natural pt-BR: "ligar João amanhã 14h",
// "whatsapp para Maria sexta", "visita Acme 25/10 às 9h30 urgente".
//
// Parser próprio (sem chrono-node): o vocabulário de vendedor é pequeno e
// fechado, e assim o fuso é sempre o de São Paulo, não o do servidor.
//
// Regras:
// - Só data → dia todo (gravado às 23:59 de SP: vence no fim do dia).
// - Só hora → hoje se a hora ainda não passou, senão amanhã.
// - Hora "solta" de 1 a 6 sem "da manhã" vira tarde (às 3 → 15h).
// - Dia da semana → a próxima ocorrência, nunca hoje ("sexta" dita na sexta
//   é a da semana que vem; para hoje, "hoje").
// - dd/mm já passado no ano → ano que vem; "dia 5" já passado → mês que vem.
// - Pessoa = palavras com maiúscula logo depois do tipo (pulando "para",
//   "com"...). Quem resolve o nome num contato é o servidor.
// ---------------------------------------------------------------------------

export interface QuickAdd {
  /** Texto da tarefa sem as palavras de data, hora e prioridade. */
  titulo: string;
  tipo: TipoDeTarefa;
  /** O tipo veio do texto (senão é "afazer" por padrão). */
  tipoReconhecido: boolean;
  dueAt: Date | null;
  diaTodo: boolean;
  prioridade: Prioridade;
  pessoa: string | null;
}

/** Hora gravada para tarefa de dia todo (fim do dia em SP). */
export const HORA_DIA_TODO = { hora: 23, minuto: 59 };

const TIPOS: Record<string, TipoDeTarefa> = {
  ligar: "ligar",
  ligacao: "ligar",
  telefonar: "ligar",
  whatsapp: "whatsapp",
  whats: "whatsapp",
  wpp: "whatsapp",
  zap: "whatsapp",
  email: "email",
  "e-mail": "email",
  reuniao: "reuniao",
  reunir: "reuniao",
  visita: "visita",
  visitar: "visita",
};

const DIAS_DA_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};
// Abreviações só valem depois de "na/no/próxima" ("ter" é verbo).
const ABREVIACOES: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const PREFIXOS_DE_DIA = new Set(["na", "no", "nesta", "neste", "esta", "este", "proxima", "proximo", "prox"]);
const CONECTORES = new Set(["para", "pra", "pro", "com", "o", "a", "ao", "a"]);
const LIGACOES_DE_NOME = new Set(["de", "da", "do", "dos", "das", "e"]);

interface Token {
  original: string;
  n: string;
  usado: boolean;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[("']+|[),.;:?'"]+$/g, "");
}

function comecaMaiuscula(s: string): boolean {
  const c = s.charAt(0);
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

const HORA_RE = /^(\d{1,2})(?:(?:h|:)(\d{2})?|hs|hrs?)$/;

export function interpretarQuickAdd(texto: string, agora: Date = new Date()): QuickAdd {
  const tokens: Token[] = texto
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ original: t, n: normalizar(t), usado: false }));
  const hoje = diaEmSP(agora);

  let tipo: TipoDeTarefa = "afazer";
  let tipoReconhecido = false;
  let posTipo = -1;
  let dia: Dia | null = null;
  let hora: { h: number; m: number } | null = null;
  let relativo: Date | null = null;
  let prioridade: Prioridade = "normal";

  const usar = (...idx: number[]) => idx.forEach((i) => tokens[i] && (tokens[i].usado = true));
  const n = (i: number) => tokens[i]?.n ?? "";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.usado) continue;
    const w = t.n;

    // Tipo: a primeira palavra que bate.
    if (!tipoReconhecido && TIPOS[w]) {
      tipo = TIPOS[w];
      tipoReconhecido = true;
      posTipo = i;
      continue;
    }

    // Prioridade.
    if (w === "urgente" || w === "importante" || t.original === "!" || t.original === "!!") {
      prioridade = "alta";
      usar(i);
      continue;
    }
    if (w === "prioridade" && n(i + 1) === "alta") {
      prioridade = "alta";
      usar(i, i + 1);
      continue;
    }

    // Datas por palavra.
    if (w === "hoje") {
      dia = hoje;
      usar(i);
      continue;
    }
    if (w === "depois" && n(i + 1) === "de" && n(i + 2) === "amanha") {
      dia = somarDias(hoje, 2);
      usar(i, i + 1, i + 2);
      continue;
    }
    if (w === "amanha") {
      dia = somarDias(hoje, 1);
      usar(i);
      continue;
    }
    if (w === "semana" && n(i + 1) === "que" && n(i + 2) === "vem") {
      dia = proximoDiaDaSemana(hoje, 1);
      usar(i, i + 1, i + 2);
      if (["na", "a"].includes(n(i - 1))) usar(i - 1);
      continue;
    }
    if ((w === "proxima" || w === "prox") && n(i + 1) === "semana") {
      dia = proximoDiaDaSemana(hoje, 1);
      usar(i, i + 1);
      if (n(i - 1) === "na") usar(i - 1);
      continue;
    }
    const dow = DIAS_DA_SEMANA[w] ?? (PREFIXOS_DE_DIA.has(n(i - 1)) ? ABREVIACOES[w] : undefined);
    if (dow !== undefined) {
      dia = proximoDiaDaSemana(hoje, dow);
      usar(i);
      if (PREFIXOS_DE_DIA.has(n(i - 1))) usar(i - 1);
      // "na próxima segunda": dois prefixos.
      if (PREFIXOS_DE_DIA.has(n(i - 2)) && tokens[i - 1]?.usado) usar(i - 2);
      if (n(i + 1) === "feira") usar(i + 1);
      continue;
    }

    // dd/mm[/aaaa]
    const dm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(w);
    if (dm) {
      const d = Number(dm[1]);
      const m = Number(dm[2]);
      let a = dm[3] ? Number(dm[3]) : hoje.ano;
      if (a < 100) a += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        let cand: Dia = { ano: a, mes: m, dia: d };
        if (!dm[3] && (m < hoje.mes || (m === hoje.mes && d < hoje.dia))) cand = { ano: a + 1, mes: m, dia: d };
        dia = cand;
        usar(i);
        if (["dia", "em", "no"].includes(n(i - 1))) usar(i - 1);
        continue;
      }
    }

    // "dia 25"
    if (w === "dia" && /^\d{1,2}$/.test(n(i + 1))) {
      const d = Number(n(i + 1));
      if (d >= 1 && d <= 31) {
        let cand: Dia = { ano: hoje.ano, mes: hoje.mes, dia: d };
        if (d < hoje.dia) cand = hoje.mes === 12 ? { ano: hoje.ano + 1, mes: 1, dia: d } : { ano: hoje.ano, mes: hoje.mes + 1, dia: d };
        dia = cand;
        usar(i, i + 1);
        if (n(i - 1) === "no") usar(i - 1);
        continue;
      }
    }

    // "em 3 dias", "daqui a 2 horas", "daqui 30 min"
    if (w === "em" || w === "daqui") {
      let j = i + 1;
      if (w === "daqui" && n(j) === "a") j++;
      const qtd = Number(n(j));
      const unidade = n(j + 1);
      if (Number.isInteger(qtd) && qtd > 0) {
        if (/^dias?$/.test(unidade)) {
          dia = somarDias(hoje, qtd);
          usar(...range(i, j + 1));
          continue;
        }
        if (/^(horas?|h)$/.test(unidade)) {
          relativo = new Date(agora.getTime() + qtd * 3_600_000);
          usar(...range(i, j + 1));
          continue;
        }
        if (/^(minutos?|min)$/.test(unidade)) {
          relativo = new Date(agora.getTime() + qtd * 60_000);
          usar(...range(i, j + 1));
          continue;
        }
      }
    }

    // Horas: "14h", "14h30", "14:30", "meio-dia", "às 9", "3 da tarde".
    if (w === "meio-dia" || (w === "meio" && n(i + 1) === "dia")) {
      hora = { h: 12, m: 0 };
      usar(i);
      if (w === "meio") usar(i + 1);
      if (["as", "ao"].includes(n(i - 1))) usar(i - 1);
      continue;
    }
    const hm = HORA_RE.exec(w);
    const soNumeroDepoisDeAs = /^\d{1,2}$/.test(w) && n(i - 1) === "as";
    const comPeriodo = /^\d{1,2}$/.test(w) && n(i + 1) === "da" && ["manha", "tarde", "noite"].includes(n(i + 2));
    if (hm || soNumeroDepoisDeAs || comPeriodo) {
      let h = Number(hm ? hm[1] : w);
      const m = hm?.[2] ? Number(hm[2]) : 0;
      if (h <= 23 && m <= 59) {
        if (comPeriodo) {
          const periodo = n(i + 2);
          if ((periodo === "tarde" || periodo === "noite") && h < 12) h += 12;
          usar(i + 1, i + 2);
        } else if (h >= 1 && h <= 6 && !(hm?.[2])) {
          // Horário comercial: "às 3" é 15h.
          h += 12;
        }
        hora = { h, m };
        usar(i);
        if (n(i - 1) === "as") usar(i - 1);
        continue;
      }
    }
  }

  // Pessoa: maiúsculas logo depois do tipo, pulando conectores.
  let pessoa: string | null = null;
  if (posTipo >= 0) {
    let j = posTipo + 1;
    while (tokens[j] && !tokens[j].usado && CONECTORES.has(tokens[j].n)) j++;
    const nome: string[] = [];
    while (tokens[j] && !tokens[j].usado) {
      const tk = tokens[j];
      if (comecaMaiuscula(tk.original)) nome.push(tk.original.replace(/[,.;:!?]+$/, ""));
      else if (nome.length > 0 && LIGACOES_DE_NOME.has(tk.n) && tokens[j + 1] && comecaMaiuscula(tokens[j + 1].original)) nome.push(tk.original);
      else break;
      if (nome.length >= 4) break;
      j++;
    }
    if (nome.length > 0) pessoa = nome.join(" ");
  }

  // Data final.
  let dueAt: Date | null = null;
  let diaTodo = false;
  if (relativo) {
    dueAt = new Date(Math.floor(relativo.getTime() / 60_000) * 60_000);
  } else if (hora) {
    let d = dia ?? hoje;
    let cand = noDia(d, hora.h, hora.m);
    if (!dia && cand.getTime() <= agora.getTime()) {
      d = somarDias(hoje, 1);
      cand = noDia(d, hora.h, hora.m);
    }
    dueAt = cand;
  } else if (dia) {
    dueAt = noDia(dia, HORA_DIA_TODO.hora, HORA_DIA_TODO.minuto);
    diaTodo = true;
  }

  const sobra = tokens.filter((t) => !t.usado).map((t) => t.original);
  // Conector pendurado no fim ("ligar João na") sai.
  while (sobra.length > 1 && CONECTORES.has(normalizar(sobra[sobra.length - 1]))) sobra.pop();
  let titulo = sobra.join(" ").trim();
  titulo = titulo ? titulo.charAt(0).toUpperCase() + titulo.slice(1) : "";

  return { titulo, tipo, tipoReconhecido, dueAt, diaTodo, prioridade, pessoa };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Usado pelos testes e pela prévia: o dia da semana (0–6) do dia de SP. */
export function diaDaSemanaDe(instante: Date): number {
  return diaDaSemana(diaEmSP(instante));
}
