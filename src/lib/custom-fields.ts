// ---------------------------------------------------------------------------
// Campos personalizados: o que são, como se validam, como se mostram.
//
// Sem `server-only` de propósito: a tela usa as mesmas regras do servidor pra
// mostrar o campo certo, formatar o valor e avisar do erro antes de enviar. Se
// as duas pontas validassem de jeito diferente, a tela aceitaria o que o
// servidor recusa, e a pessoa só descobriria depois de clicar em salvar.
// ---------------------------------------------------------------------------

export type EntidadeDoCampo = "deal" | "contact";

export type TipoDeCampo =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "url"
  | "phone"
  | "email";

export interface OpcaoDeCampo {
  value: string;
  label: string;
  color?: string;
}

export interface DefinicaoDeCampo {
  id: string;
  entity: EntidadeDoCampo;
  pipelineId: string | null;
  key: string;
  label: string;
  type: TipoDeCampo;
  options: OpcaoDeCampo[];
  required: boolean;
  helpText: string;
  showOnCard: boolean;
  position: number;
}

export interface TipoDeCampoInfo {
  id: TipoDeCampo;
  rotulo: string;
  descricao: string;
  exemplo: string;
  /** Aceita lista de opções? */
  comOpcoes: boolean;
  /** Dá pra somar e tirar média num gráfico? */
  numerico: boolean;
}

/**
 * O que a pessoa escolhe ao criar um campo. A descrição fala do dado, não do
 * tipo técnico: "Número" e "Moeda" parecem a mesma coisa até alguém somar
 * "Consumo em kWh" como se fosse dinheiro.
 */
export const TIPOS_DE_CAMPO: TipoDeCampoInfo[] = [
  { id: "text", rotulo: "Texto curto", descricao: "Uma linha: um nome, um código, uma cidade.", exemplo: "Campinas", comOpcoes: false, numerico: false },
  { id: "longtext", rotulo: "Texto longo", descricao: "Várias linhas: observações, o que o cliente pediu.", exemplo: "Quer instalar até dezembro", comOpcoes: false, numerico: false },
  { id: "number", rotulo: "Número", descricao: "Uma quantidade que dá para somar e tirar média.", exemplo: "480", comOpcoes: false, numerico: true },
  { id: "currency", rotulo: "Valor em reais", descricao: "Dinheiro. Aparece como R$ e soma no dashboard.", exemplo: "R$ 28.500,00", comOpcoes: false, numerico: true },
  { id: "date", rotulo: "Data", descricao: "Um dia: visita agendada, vencimento.", exemplo: "15/12/2026", comOpcoes: false, numerico: false },
  { id: "select", rotulo: "Lista (uma opção)", descricao: "Escolher uma entre opções que você define.", exemplo: "Casa, Apartamento, Comércio", comOpcoes: true, numerico: false },
  { id: "multiselect", rotulo: "Lista (várias opções)", descricao: "Marcar mais de uma opção.", exemplo: "Telhado, Solo, Carport", comOpcoes: true, numerico: false },
  { id: "checkbox", rotulo: "Sim ou não", descricao: "Uma pergunta de resposta fechada.", exemplo: "Tem financiamento: Sim", comOpcoes: false, numerico: false },
  { id: "url", rotulo: "Link", descricao: "Um endereço da internet.", exemplo: "https://...", comOpcoes: false, numerico: false },
  { id: "phone", rotulo: "Telefone", descricao: "Um número de telefone.", exemplo: "(19) 99999-0000", comOpcoes: false, numerico: false },
  { id: "email", rotulo: "E-mail", descricao: "Um endereço de e-mail.", exemplo: "nome@empresa.com", comOpcoes: false, numerico: false },
];

export const TIPO_POR_ID = new Map(TIPOS_DE_CAMPO.map((t) => [t.id, t]));

/**
 * Chaves que já significam outra coisa no CRM. O motor liga a variável
 * "email" à coluna de e-mail do contato; um campo personalizado com essa chave
 * ficaria duplicado, e nenhum dos dois seria o que a pessoa espera.
 */
export const CHAVES_RESERVADAS = new Set([
  "nome", "name", "nomecompleto", "primeironome", "email", "mail", "telefone", "phone", "whatsapp",
  "celular", "empresa", "cargo", "id", "createdat", "updatedat",
]);

/** "Consumo mensal (kWh)" -> "consumo_mensal_kwh". */
export function slugificar(rotulo: string): string {
  const base = rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) return "campo";
  // Chave que começa com dígito atrapalha em expressão ({1_casa}) e em JSON path.
  return /^\d/.test(base) ? `c_${base}` : base;
}

export function parseMoeda(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Acha a opção pelo identificador ou, na falta, pelo rótulo sem acento nem
 * caixa. É o que deixa o agente gravar "Apartamento" (o que o cliente disse)
 * num campo cuja opção guardada é "apartamento".
 */
function opcaoPorValorOuRotulo(opcoes: OpcaoDeCampo[], texto: string): string | null {
  const t = texto.trim();
  const direta = opcoes.find((o) => o.value === t);
  if (direta) return direta.value;
  const norm = semAcento(t);
  const porRotulo = opcoes.find((o) => semAcento(o.label) === norm || semAcento(o.value) === norm);
  return porRotulo ? porRotulo.value : null;
}

export type ResultadoDeValor = { ok: true; valor: unknown } | { ok: false; erro: string };

const vazio = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Valida e converte um valor pro formato guardado. `valor: null` quer dizer
 * "limpar o campo". Devolve o erro em português, que é o que a tela mostra.
 */
export function normalizarValor(def: Pick<DefinicaoDeCampo, "type" | "label" | "options">, bruto: unknown): ResultadoDeValor {
  if (vazio(bruto)) return { ok: true, valor: null };

  switch (def.type) {
    case "text":
    case "longtext": {
      const t = String(bruto).trim();
      const max = def.type === "text" ? 300 : 4000;
      if (t.length > max) return { ok: false, erro: `${def.label}: no máximo ${max} caracteres.` };
      return { ok: true, valor: t };
    }

    case "number": {
      const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, erro: `${def.label}: informe um número.` };
      return { ok: true, valor: n };
    }

    case "currency": {
      // Aceita o valor já em centavos (número) ou o texto digitado ("1.500,50").
      const cents = typeof bruto === "number" ? Math.round(bruto) : parseMoeda(String(bruto));
      if (cents === null || !Number.isFinite(cents)) return { ok: false, erro: `${def.label}: informe um valor em reais.` };
      return { ok: true, valor: cents };
    }

    case "date": {
      const t = String(bruto).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(t).getTime())) {
        return { ok: false, erro: `${def.label}: informe uma data válida.` };
      }
      return { ok: true, valor: t };
    }

    case "select": {
      const v = opcaoPorValorOuRotulo(def.options, String(bruto));
      if (v === null) return { ok: false, erro: `${def.label}: escolha uma das opções da lista.` };
      return { ok: true, valor: v };
    }

    case "multiselect": {
      const lista = Array.isArray(bruto) ? bruto.map(String) : String(bruto).split(",");
      const convertidas: string[] = [];
      for (const item of lista) {
        if (!item.trim()) continue;
        const v = opcaoPorValorOuRotulo(def.options, item);
        if (v === null) return { ok: false, erro: `${def.label}: "${item.trim()}" não está na lista de opções.` };
        convertidas.push(v);
      }
      return { ok: true, valor: [...new Set(convertidas)] };
    }

    case "checkbox": {
      if (typeof bruto === "boolean") return { ok: true, valor: bruto };
      const t = String(bruto).trim().toLowerCase();
      if (["true", "sim", "s", "1", "yes"].includes(t)) return { ok: true, valor: true };
      if (["false", "nao", "não", "n", "0", "no"].includes(t)) return { ok: true, valor: false };
      return { ok: false, erro: `${def.label}: responda sim ou não.` };
    }

    case "url": {
      const t = String(bruto).trim();
      const comEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      try {
        const u = new URL(comEsquema);
        if (!u.hostname.includes(".")) throw new Error("sem domínio");
        return { ok: true, valor: comEsquema.slice(0, 500) };
      } catch {
        return { ok: false, erro: `${def.label}: informe um link válido.` };
      }
    }

    case "email": {
      const t = String(bruto).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return { ok: false, erro: `${def.label}: informe um e-mail válido.` };
      return { ok: true, valor: t };
    }

    case "phone": {
      const t = String(bruto).trim();
      const digitos = t.replace(/\D/g, "");
      if (digitos.length < 8 || digitos.length > 15) return { ok: false, erro: `${def.label}: informe um telefone válido.` };
      return { ok: true, valor: t.slice(0, 40) };
    }
  }
}

/**
 * Valor guardado -> texto pra mostrar. Cada tipo aparece como a pessoa lê:
 * dinheiro em R$, data no formato brasileiro, opção pelo rótulo (não pelo
 * identificador interno).
 */
export function formatarValor(def: Pick<DefinicaoDeCampo, "type" | "options">, valor: unknown): string {
  if (vazio(valor)) return "";

  switch (def.type) {
    case "currency":
      return (Number(valor) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "number":
      return Number(valor).toLocaleString("pt-BR");
    case "date": {
      const d = new Date(`${String(valor)}T12:00:00`);
      return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR");
    }
    case "select":
      return def.options.find((o) => o.value === valor)?.label ?? String(valor);
    case "multiselect":
      return (Array.isArray(valor) ? valor : [valor])
        .map((v) => def.options.find((o) => o.value === v)?.label ?? String(v))
        .join(", ");
    case "checkbox":
      return valor === true ? "Sim" : "Não";
    default:
      return String(valor);
  }
}

/**
 * O valor como número, pra somar e tirar média. Moeda volta em reais (não em
 * centavos): quem soma "valor da instalação" no gráfico quer ver reais.
 * Texto que parece número ("480", vindo de uma pergunta do agente) também conta.
 */
export function valorNumerico(def: Pick<DefinicaoDeCampo, "type">, valor: unknown): number | null {
  if (vazio(valor)) return null;
  if (def.type === "currency") {
    const n = Number(valor);
    return Number.isFinite(n) ? n / 100 : null;
  }
  if (def.type === "number") {
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Valor guardado -> o que o campo de formulário espera ver. */
export function valorParaFormulario(def: Pick<DefinicaoDeCampo, "type">, valor: unknown): string {
  if (vazio(valor)) return "";
  if (def.type === "currency") return (Number(valor) / 100).toFixed(2).replace(".", ",");
  if (def.type === "number") return String(valor).replace(".", ",");
  if (def.type === "multiselect") return Array.isArray(valor) ? valor.join(",") : String(valor);
  return String(valor);
}

export const CORES_DE_ETAPA = ["slate", "blue", "violet", "amber", "emerald", "rose", "cyan"] as const;
export type CorDeEtapa = (typeof CORES_DE_ETAPA)[number];

/** Classes de ponto e de texto por cor. Nome da cor -> classe, num lugar só. */
export const COR_DA_ETAPA: Record<string, { ponto: string; texto: string; fundo: string }> = {
  slate: { ponto: "bg-slate-400", texto: "text-slate-300", fundo: "bg-slate-400/12" },
  blue: { ponto: "bg-blue-400", texto: "text-blue-300", fundo: "bg-blue-400/12" },
  violet: { ponto: "bg-violet-400", texto: "text-violet-300", fundo: "bg-violet-400/12" },
  amber: { ponto: "bg-amber-400", texto: "text-amber-300", fundo: "bg-amber-400/12" },
  emerald: { ponto: "bg-emerald-400", texto: "text-emerald-300", fundo: "bg-emerald-400/12" },
  rose: { ponto: "bg-rose-400", texto: "text-rose-300", fundo: "bg-rose-400/12" },
  cyan: { ponto: "bg-cyan-400", texto: "text-cyan-300", fundo: "bg-cyan-400/12" },
};

/** Cor da etapa: a escolhida, ou a padrão do tipo (ganho verde, perda vermelha, aberta neutra). */
export function corDaEtapa(cor: string, tipo: string): { ponto: string; texto: string; fundo: string } {
  if (cor && COR_DA_ETAPA[cor]) return COR_DA_ETAPA[cor];
  if (tipo === "won") return COR_DA_ETAPA.emerald;
  if (tipo === "lost") return COR_DA_ETAPA.rose;
  return COR_DA_ETAPA.slate;
}
