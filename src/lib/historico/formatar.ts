import { ACOES_ROTULO, ESCOPO_ROTULO, MODULOS } from "@/lib/permissoes/catalogo";
import type { LinhaDoHistorico, MudancaLegivel, Mudancas } from "./tipos";

// ---------------------------------------------------------------------------
// Histórico em português: o diff vem no formato da API v1 (owner_id,
// amount_cents, custom_fields.x, ids) e a tela mostra "Responsável: Ana →
// Bruno". Puro: o servidor monta o dicionário de nomes (historico-leitura.ts)
// e chama daqui; os testes rodam sem banco.
// ---------------------------------------------------------------------------

export interface CampoDoDicionario {
  rotulo: string;
  tipo: string;
  opcoes?: { value: string; label: string }[];
}

export interface Dicionario {
  pessoas: Record<string, string>;
  etapas: Record<string, string>;
  funis: Record<string, string>;
  empresas: Record<string, string>;
  contatos: Record<string, string>;
  /** Campos personalizados por chave (a mesma chave pode existir em objeto diferente: o servidor manda os do objeto). */
  campos: Record<string, Record<string, CampoDoDicionario>>;
}

export const DICIONARIO_VAZIO: Dicionario = { pessoas: {}, etapas: {}, funis: {}, empresas: {}, contatos: {}, campos: {} };

const ROTULOS: Record<string, string> = {
  name: "Nome",
  description: "Descrição",
  category: "Categoria",
  pipeline_id: "Funil",
  stage_id: "Etapa",
  amount_cents: "Valor",
  probability: "Probabilidade",
  lost_reason: "Motivo da perda",
  expected_closing_at: "Previsão de fechamento",
  company_id: "Empresa",
  owner_id: "Responsável",
  contacts: "Contatos",
  email: "E-mail",
  emails: "Outros e-mails",
  phone: "Telefone",
  phones: "Outros telefones",
  job_title: "Cargo",
  linkedin_url: "LinkedIn",
  background: "Sobre",
  notes: "Observações",
  source: "Origem",
  opt_in: "Aceita mensagens",
  opted_out_at: "Descadastro",
  lead_stage: "Etapa do lead",
  tags: "Etiquetas",
  channels: "Canais",
  cnpj: "CNPJ",
  sector: "Setor",
  size: "Porte",
  website: "Site",
  address: "Endereço",
  city: "Cidade",
  uf: "UF",
  zipcode: "CEP",
  revenue: "Faturamento",
  // conta (historico-conta.ts e membros.ts)
  nome: "Nome",
  descricao: "Descrição",
  papel: "Papel",
  papel_personalizado: "Papel personalizado",
  grupos: "Grupos",
  equipes: "Equipes",
  permissoes: "Permissões",
  escopo: "Visibilidade dos dados",
  lider: "Líder",
  membros: "Membros",
};

/** Mudam junto com outra coisa (a etapa, o arquivamento) ou são técnicos: não aparecem. */
const IGNORADOS = new Set(["status", "closed_at", "stage_since", "position", "currency", "archived_at", "external_id", "created_at", "updated_at", "last_seen_at"]);
/** Na ficha do negócio a etapa já tem o próprio item ("Movido de A para B"). */
const DA_ETAPA = new Set(["stage_id", "pipeline_id"]);

const FUSO = "America/Sao_Paulo";
const VAZIO = "vazio";
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const brl = (reais: number) => reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function data(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  // Data sem hora (ou meia-noite UTC, como a API grava datas): o dia como está.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) || /T00:00:00(\.000)?Z$/.test(v)) return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return `${d.toLocaleDateString("pt-BR", { timeZone: FUSO })} ${d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

const ROTULO_DA_PERMISSAO: Record<string, string> = Object.fromEntries(
  MODULOS.flatMap((m) => m.acoes.map((a) => [`${m.id}:${a}`, `${m.nome}: ${ACOES_ROTULO[a] ?? a}`]))
);
const NOME_DO_MODULO: Record<string, string> = Object.fromEntries(MODULOS.map((m) => [m.id, m.nome]));

function vazio(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function nomeOu(mapa: Record<string, string>, id: unknown): string {
  return typeof id === "string" ? (mapa[id] ?? "removido") : String(id);
}

/** Lista de { id, name } (etiquetas), { contact_id } (contatos), { channel } ou texto. */
function itensDaLista(campo: string, v: unknown[], d: Dicionario): string[] {
  return v.map((x) => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.name === "string") return o.name;
      if (typeof o.contact_id === "string") return nomeOu(d.contatos, o.contact_id);
      if (typeof o.channel === "string") return o.channel;
      return JSON.stringify(o);
    }
    if (campo === "permissoes" && typeof x === "string") return ROTULO_DA_PERMISSAO[x] ?? x;
    return String(x);
  });
}

function valor(campo: string, v: unknown, d: Dicionario, def?: CampoDoDicionario): string {
  if (vazio(v)) return VAZIO;
  if (def) {
    if (def.tipo === "currency" && typeof v === "number") return brl(v);
    if (def.tipo === "checkbox") return v === true || v === "true" ? "Sim" : "Não";
    if (def.tipo === "date" && typeof v === "string") return data(v);
    if (def.tipo === "select") return def.opcoes?.find((o) => o.value === String(v))?.label ?? String(v);
    if (def.tipo === "multiselect" && Array.isArray(v)) return v.map((x) => def.opcoes?.find((o) => o.value === String(x))?.label ?? String(x)).join(", ");
  }
  if (campo === "amount_cents" && typeof v === "number") return brl(v / 100);
  if (campo === "probability" && typeof v === "number") return `${v}%`;
  if (campo === "owner_id") return nomeOu(d.pessoas, v);
  if (campo === "stage_id") return nomeOu(d.etapas, v);
  if (campo === "pipeline_id") return nomeOu(d.funis, v);
  if (campo === "company_id") return nomeOu(d.empresas, v);
  if (campo === "escopo" && v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, string>)
      .map(([m, e]) => `${NOME_DO_MODULO[m] ?? m}: ${ESCOPO_ROTULO[e as keyof typeof ESCOPO_ROTULO] ?? e}`)
      .join(", ");
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  if (typeof v === "string") return ISO_RE.test(v) && /^\d{4}-\d{2}-\d{2}/.test(v) ? data(v) : v;
  if (Array.isArray(v)) return itensDaLista(campo, v, d).join(", ");
  return JSON.stringify(v);
}

function rotuloDoCampo(campo: string, def?: CampoDoDicionario): string {
  if (def) return def.rotulo;
  if (campo.startsWith("custom_fields.")) return campo.slice("custom_fields.".length);
  return ROTULOS[campo] ?? campo;
}

/**
 * Lista que mudou (etiquetas, permissões, grupos, membros): o que entrou e o
 * que saiu, em vez das duas listas inteiras.
 */
function diferencaDeLista(campo: string, de: unknown, para: unknown, d: Dicionario): { de: string; para: string } | null {
  const a = Array.isArray(de) ? de : vazio(de) ? [] : null;
  const b = Array.isArray(para) ? para : vazio(para) ? [] : null;
  if (!a || !b || (a.length === 0 && b.length === 0)) return null;
  const antes = itensDaLista(campo, a, d);
  const depois = itensDaLista(campo, b, d);
  const entrou = depois.filter((x) => !antes.includes(x));
  const saiu = antes.filter((x) => !depois.includes(x));
  const partes = [...entrou.map((x) => `+ ${x}`), ...saiu.map((x) => `− ${x}`)];
  return { de: "", para: partes.join(", ") || depois.join(", ") || VAZIO };
}

export function formatarMudancas(objeto: string, m: Mudancas | null, d: Dicionario, opcoes: { semEtapa?: boolean } = {}): MudancaLegivel[] {
  if (!m) return [];
  const campos = d.campos[objeto] ?? {};
  const out: MudancaLegivel[] = [];
  for (const [campo, mud] of Object.entries(m)) {
    if (IGNORADOS.has(campo)) continue;
    if (opcoes.semEtapa && DA_ETAPA.has(campo)) continue;
    const def = campo.startsWith("custom_fields.") ? campos[campo.slice("custom_fields.".length)] : undefined;
    const rotulo = rotuloDoCampo(campo, def);
    const lista = def ? null : diferencaDeLista(campo, mud?.de, mud?.para, d);
    if (lista) {
      out.push({ campo, rotulo, ...lista });
      continue;
    }
    out.push({ campo, rotulo, de: valor(campo, mud?.de, d, def), para: valor(campo, mud?.para, d, def) });
  }
  return out;
}

const ARTIGO: Record<string, string> = { deal: "o negócio", contact: "o contato", company: "a empresa" };
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Uma frase para a lista da auditoria e o título do item na ficha. */
export function resumoDaLinha(l: Pick<LinhaDoHistorico, "acao" | "objeto" | "objetoNome" | "detalhes">, mudancas: number): string {
  const det = l.detalhes ?? {};
  const nome = l.objetoNome || "sem nome";
  const txt = (k: string) => (typeof det[k] === "string" ? (det[k] as string) : "");
  switch (l.acao) {
    case "criou":
      return `Criou ${ARTIGO[l.objeto] ?? "o registro"}`;
    case "alterou":
      return mudancas === 0 ? "Alterou" : `Alterou ${plural(mudancas, "campo", "campos")}`;
    case "apagou":
      return det.lixeira === false ? `Apagou ${ARTIGO[l.objeto] ?? "o registro"} de vez` : `Apagou ${ARTIGO[l.objeto] ?? "o registro"} (foi para a lixeira)`;
    case "restaurou":
      return `Restaurou ${ARTIGO[l.objeto] ?? "o registro"} da lixeira`;
    case "membro.convidou":
      return `Convidou ${nome}${txt("email") && txt("email") !== nome ? ` (${txt("email")})` : ""}${txt("papel") ? ` como ${txt("papel")}` : ""}`;
    case "membro.removeu":
      return `Removeu ${nome} do contrato`;
    case "membro.mudou_acesso":
      return `Mudou o acesso de ${nome}`;
    case "papel.criou":
      return `Criou o papel ${nome}`;
    case "papel.alterou":
      return `Alterou o papel ${nome}`;
    case "papel.apagou":
      return `Apagou o papel ${nome}`;
    case "grupo.criou":
      return `Criou o grupo de permissões ${nome}`;
    case "grupo.alterou":
      return `Alterou o grupo de permissões ${nome}`;
    case "grupo.apagou":
      return `Apagou o grupo de permissões ${nome}`;
    case "equipe.criou":
      return `Criou a equipe ${nome}`;
    case "equipe.alterou":
      return `Alterou a equipe ${nome}`;
    case "equipe.apagou":
      return `Apagou a equipe ${nome}`;
    case "chave_api.criou":
      return `Criou a chave de API ${nome}${txt("prefixo") ? ` (${txt("prefixo")}…)` : ""}`;
    case "chave_api.revogou":
      return `Revogou a chave de API ${nome}${txt("prefixo") ? ` (${txt("prefixo")}…)` : ""}`;
    case "exportou": {
      const n = typeof det.quantidade === "number" ? det.quantidade : null;
      const contatos = det.entidade === "contatos";
      const qtd = n === null ? (contatos ? "contatos" : "negócios") : contatos ? plural(n, "contato", "contatos") : plural(n, "negócio", "negócios");
      const funil = txt("funil") ? ` do funil ${txt("funil")}` : "";
      const como = txt("formato") === "relatório" ? " (relatório)" : txt("pela") === "api" ? " pela API" : "";
      return `Exportou ${qtd}${funil}${como}`;
    }
  }
  return l.acao;
}
