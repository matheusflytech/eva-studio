import { dataExiste, parseNumero, type DefinicaoDeCampo } from "@/lib/custom-fields";
import {
  AGRUPAMENTOS_BASE,
  CAMPOS_DE_FILTRO,
  DATAS_BASE,
  LIMITE_DE_CONDICOES,
  LIMITE_DE_GRUPOS,
  MEDIDAS,
  OPERADORES_POR_TIPO,
  ROTULO_CANAL,
  SEM_VALOR,
  STATUS,
  campoDeFiltro,
  dataBaseEfetiva,
  descreverCondicao,
  medidaPrecisaCampo,
  normalizarCondicao,
  operadoresDoCampo,
  sanearCondicao,
  sanearConsulta,
  sanearFiltrosGlobais,
  somarDias,
  tiposPermitidos,
  type CampoDeFiltro,
  type Consulta,
  type FiltroDeConsulta,
  type FiltrosGlobais,
  type GrupoDeFiltros,
  type RotulosDaConsulta,
  type TipoDeCartao,
} from "@/lib/consulta";

// ---------------------------------------------------------------------------
// "Pergunte à Eva" do dashboard: transforma uma frase em português numa
// Consulta (o mesmo objeto que o montador de cartões monta à mão).
//
// Tudo aqui é puro (sem banco, sem chave, sem rede) de propósito: o prompt e a
// validação são a parte que dá para testar a fundo. A regra de ouro é que o
// modelo NUNCA é confiável — ele só sugere; o que sai daqui passou pelo
// sanearConsulta e por uma checagem de que cada id, chave e opção existe na
// organização. O que não existe é descartado e vira aviso para a pessoa.
// ---------------------------------------------------------------------------

export type ModoDaIa = "cartao" | "globais";

/** O que a organização tem de verdade: a IA só pode escolher daqui. */
export interface CatalogoDoCrm {
  funis: { id: string; name: string; stages: { id: string; name: string; type: string }[] }[];
  membros: { id: string; name: string }[];
  etiquetas: { id: string; name: string }[];
  empresas: { id: string; name: string }[];
  canais: string[];
  motivosDePerda: string[];
  campos: Pick<DefinicaoDeCampo, "key" | "label" | "type" | "options">[];
}

/** Limites do catálogo no prompt: organização grande não pode estourar o contexto. */
export const LIMITES_DO_CATALOGO = { membros: 200, etiquetas: 150, empresas: 150, motivos: 50, opcoes: 60, campos: 80 };

export const LIMITE_DO_PEDIDO = 500;

const TIPOS_AGRUPAVEIS = new Set(["select", "multiselect", "checkbox", "text", "number", "currency", "date"]);
const TIPOS_NUMERICOS = new Set(["number", "currency"]);

/** Dias que a barra do painel tem como botão; outro número vira intervalo. */
const PRESETS_DE_DIAS = [1, 7, 30, 90, 180, 365];

export const PERIODOS_RELATIVOS = [
  "hoje",
  "ontem",
  "esta_semana",
  "semana_passada",
  "este_mes",
  "mes_passado",
  "este_trimestre",
  "trimestre_passado",
  "este_ano",
  "ano_passado",
] as const;
export type PeriodoRelativo = (typeof PERIODOS_RELATIVOS)[number];

// ── Prompt ─────────────────────────────────────────────────────────────────

/** Nome vindo do banco vai numa linha só e curto: não deixa um nome quebrar o prompt. */
function limpo(t: string, max = 80): string {
  return String(t ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function diaDaSemana(dia: string): string {
  return DIAS_DA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}

const ROTULO_TIPO_CAMPO: Record<string, string> = {
  text: "texto", longtext: "texto", url: "texto", phone: "texto", email: "texto",
  number: "número", currency: "dinheiro (reais)", date: "data", select: "lista (uma opção)",
  multiselect: "lista (várias opções)", checkbox: "sim/não",
};

function linhasDoCatalogo(c: CatalogoDoCrm): string[] {
  const L = LIMITES_DO_CATALOGO;
  const linhas: string[] = [];
  const corte = (total: number, max: number) => (total > max ? ` (mostrando ${max} de ${total})` : "");

  linhas.push("FUNIS E ETAPAS (id = nome):");
  if (c.funis.length === 0) linhas.push("- (nenhum funil)");
  for (const f of c.funis) {
    const etapas = f.stages.map((s) => `${s.id} = ${limpo(s.name, 50)}${s.type === "won" ? " [ganho]" : s.type === "lost" ? " [perdido]" : ""}`);
    linhas.push(`- funil ${f.id} = ${limpo(f.name)}; etapas: ${etapas.join("; ") || "(nenhuma)"}`);
  }

  linhas.push("", `RESPONSÁVEIS (id = nome)${corte(c.membros.length, L.membros)}:`);
  linhas.push(`- ${SEM_VALOR} = sem responsável`);
  for (const m of c.membros.slice(0, L.membros)) linhas.push(`- ${m.id} = ${limpo(m.name)}`);

  linhas.push("", `ETIQUETAS DO CONTATO (id = nome)${corte(c.etiquetas.length, L.etiquetas)}:`);
  if (c.etiquetas.length === 0) linhas.push("- (nenhuma)");
  for (const e of c.etiquetas.slice(0, L.etiquetas)) linhas.push(`- ${e.id} = ${limpo(e.name)}`);

  linhas.push("", `EMPRESAS (id = nome)${corte(c.empresas.length, L.empresas)}:`);
  linhas.push(`- ${SEM_VALOR} = sem empresa`);
  for (const e of c.empresas.slice(0, L.empresas)) linhas.push(`- ${e.id} = ${limpo(e.name)}`);

  linhas.push("", "CANAIS DO CONTATO (valor = nome):");
  if (c.canais.length === 0) linhas.push("- (nenhum)");
  for (const canal of c.canais) linhas.push(`- ${canal} = ${ROTULO_CANAL[canal] ?? canal}`);

  linhas.push("", `MOTIVOS DE PERDA JÁ USADOS (texto livre, use com op "eq" ou "contem")${corte(c.motivosDePerda.length, L.motivos)}:`);
  if (c.motivosDePerda.length === 0) linhas.push("- (nenhum)");
  for (const m of c.motivosDePerda.slice(0, L.motivos)) linhas.push(`- ${limpo(m)}`);

  linhas.push("", `CAMPOS PERSONALIZADOS DO NEGÓCIO (use "cf:<chave>")${corte(c.campos.length, L.campos)}:`);
  if (c.campos.length === 0) linhas.push("- (nenhum)");
  for (const d of c.campos.slice(0, L.campos)) {
    const tipo = ROTULO_TIPO_CAMPO[d.type] ?? "texto";
    const opcoes = (d.options ?? []).slice(0, L.opcoes).map((o) => `${limpo(o.value, 40)} = ${limpo(o.label, 40)}`);
    linhas.push(`- cf:${d.key} = ${limpo(d.label)} [${tipo}]${opcoes.length ? `; opções (valor = nome): ${opcoes.join("; ")}` : ""}`);
  }
  return linhas;
}

function linhasDoEsquema(): string[] {
  const camposBase = CAMPOS_DE_FILTRO.map((c) => `${c.id} (${c.rotulo}, ${c.tipo})`).join("; ");
  const ops = Object.entries(OPERADORES_POR_TIPO)
    .map(([tipo, lista]) => `${tipo}: ${lista.map((o) => o.id).join(", ")}`)
    .join(" | ");
  return [
    "FORMATO DA RESPOSTA (um único objeto JSON):",
    `{
  "consulta": {
    "medida": ${MEDIDAS.map((m) => `"${m.id}"`).join(" | ")},
    "campo": "valor" | "ponderado" | "cf:<chave numérica>"   (só para soma, media, mediana, minimo, maximo),
    "agrupar": "" | ${AGRUPAMENTOS_BASE.filter((a) => a.id).map((a) => `"${a.id}"`).join(" | ")} | "cf:<chave>",
    "status": ${STATUS.map((s) => `"${s.id}"`).join(" | ")},
    "funilIds": ["<id de funil>"],
    "periodo": "painel" | "tudo" | {"de": "AAAA-MM-DD", "ate": "AAAA-MM-DD"} | {"ultimosDias": N} | {"relativo": ${PERIODOS_RELATIVOS.map((p) => `"${p}"`).join(" | ")}},
    "dataBase": ${DATAS_BASE.map((d) => `"${d.id}"`).join(" | ")}   (opcional),
    "filtros": {"logica": "e" | "ou", "grupos": [{"logica": "e" | "ou", "condicoes": [{"campo": "...", "op": "...", "valor": "...", "valores": ["..."], "ate": "..."}]}]},
    "comparar": true | false
  },
  "tipo": "numero" | "linha" | "pizza" | "barras" | "tabela",
  "titulo": "título curto do cartão",
  "explicacao": "uma frase curta, em português, do que você entendeu",
  "naoEntendi": ["parte do pedido que não deu para representar"]
}`,
    "",
    `CAMPOS DE FILTRO BASE (id, nome, tipo): ${camposBase}.`,
    `Campos personalizados entram como "cf:<chave>" com o tipo indicado no catálogo (dinheiro/número = numero, data = data, lista (uma opção) = lista, lista (várias opções) = multi, sim/não = sim_nao, o resto = texto).`,
    `OPERADORES POR TIPO: ${ops}.`,
    `Listas usam "valores" (ids do catálogo ou valores de opção). "entre" usa "valor" e "ate". "ultimos"/"proximos" usam "valor" = número de dias. sim_nao usa op "eq" com valor "true" ou "false". Datas em AAAA-MM-DD.`,
  ];
}

const REGRAS = [
  "REGRAS:",
  "- Use SOMENTE ids, chaves e valores de opção que estão no CATÁLOGO. Nunca invente id. Se algo do pedido não existe, deixe de fora e conte em \"naoEntendi\".",
  "- Dinheiro é em reais, número puro: \"10 mil\" = \"10000\", \"1,5 milhão\" = \"1500000\".",
  "- \"Parado há mais de N dias\" = campo diasNaEtapa, op gt, valor N.",
  "- \"Ganhei\", \"vendi\", \"faturei\", \"fechei\" = status ganhos (data base fechamento). \"Perdi\" = perdidos. \"Em aberto\", \"em andamento\", \"parados\" = abertos. Sem menção à situação = todos.",
  "- \"Quanto ganhei/vendi\" = medida soma, campo valor. \"Quantos\" = contagem. \"Taxa de ganho/conversão\" = medida taxaGanho, status todos, dataBase fechamento.",
  "- \"Por mês\", \"por semana\"... = agrupar mes/semana/dia/trimestre. \"Por <campo>\" = agrupar por esse campo (base ou cf:). \"Origem do lead\" = um campo personalizado com esse sentido, se existir; senão agrupar canal.",
  "- Período: \"últimos N dias\" = {\"ultimosDias\": N} (semanas × 7, meses × 30). \"Este mês\", \"mês passado\", \"este ano\"... = {\"relativo\": ...}. Datas exatas = {\"de\", \"ate\"}. Sem menção a período = \"painel\". \"Desde sempre\", \"todo o histórico\" = \"tudo\".",
  "- Use \"funilIds\" para funis citados; não repita o funil como condição.",
  "- Sem condições: \"filtros\": {\"logica\": \"e\", \"grupos\": []}. Condições que valem juntas ficam num grupo com logica \"e\".",
  "- tipo: \"numero\" quando agrupar é \"\"; \"linha\" ou \"barras\" para tempo; \"barras\" ou \"pizza\" para categorias; \"tabela\" quando pedem a lista de negócios (\"quais negócios\", \"liste\").",
  "- comparar só faz sentido com agrupar \"\" e período diferente de \"tudo\".",
  "- Responda só o JSON, sem markdown, sem texto antes ou depois. Textos em português do Brasil.",
];

export interface OpcoesDoPrompt {
  /** AAAA-MM-DD no fuso de São Paulo. */
  hoje: string;
  modo: ModoDaIa;
  /** Montador: o que já está montado, para pedidos de ajuste ("agora só os ganhos"). */
  consultaAtual?: Consulta | null;
}

/** Prompt de sistema com o catálogo real da org. Não leva segredo nenhum: só nomes e ids da própria org. */
export function montarPromptDeConsulta(catalogo: CatalogoDoCrm, o: OpcoesDoPrompt): string {
  const partes = [
    "Você é a Eva, assistente de um CRM. Sua tarefa é transformar o pedido da pessoa, em português, numa consulta de dashboard sobre NEGÓCIOS do CRM.",
    `Hoje é ${o.hoje} (${diaDaSemana(o.hoje)}), fuso America/Sao_Paulo. Use essa data para entender "este ano", "mês passado", "últimos 90 dias".`,
    "",
    ...linhasDoEsquema(),
    "",
    ...REGRAS,
  ];
  if (o.modo === "globais") {
    partes.push(
      "",
      "MODO FILTROS DO PAINEL: o painel aplica direto só período, funis e responsáveis. Monte a consulta completa mesmo assim (as outras condições viram sugestão de cartão). Responsável citado = condição campo \"responsavel\" op \"qualquer\". Sem menção à situação, use status \"todos\" e medida \"contagem\"."
    );
  }
  if (o.consultaAtual) {
    partes.push(
      "",
      "CONSULTA ATUAL DO MONTADOR (se o pedido for um ajuste, como \"agora só os ganhos\", parta dela; se for um pedido novo, ignore):",
      JSON.stringify(o.consultaAtual)
    );
  }
  partes.push("", "CATÁLOGO DA ORGANIZAÇÃO:", ...linhasDoCatalogo(catalogo));
  return partes.join("\n");
}

// ── Leitura da resposta ────────────────────────────────────────────────────

/** Tira o JSON do texto do modelo (com ou sem cerca de markdown). null = não é JSON. */
export function extrairJson(texto: string | null | undefined): Record<string, unknown> | null {
  if (!texto) return null;
  const semCerca = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    const v = JSON.parse(semCerca.slice(ini, fim + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── Período ────────────────────────────────────────────────────────────────

export type PeriodoResolvido =
  | { tipo: "painel" }
  | { tipo: "tudo" }
  | { tipo: "intervalo"; de: string; ate: string; relativo?: PeriodoRelativo }
  | { tipo: "ultimos"; dias: number; de: string; ate: string };

function inicioDaSemana(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return somarDias(dia, -((dow + 6) % 7));
}

function inicioDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

function fimDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return somarDias(proximo, -1);
}

function inicioDoTrimestre(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  const mesIni = Math.floor((m - 1) / 3) * 3 + 1;
  return `${a}-${String(mesIni).padStart(2, "0")}-01`;
}

function fimDoTrimestre(dia: string): string {
  return fimDoMes(somarDias(inicioDoTrimestre(dia), 62));
}

/**
 * Períodos "da vez" (este mês, este ano) vão até o fim do período, não até
 * hoje: um cartão "este ano" salvo hoje precisa contar a venda de amanhã.
 */
export function intervaloRelativo(r: PeriodoRelativo, hoje: string): { de: string; ate: string } {
  const ano = Number(hoje.slice(0, 4));
  switch (r) {
    case "hoje": return { de: hoje, ate: hoje };
    case "ontem": {
      const d = somarDias(hoje, -1);
      return { de: d, ate: d };
    }
    case "esta_semana": {
      const de = inicioDaSemana(hoje);
      return { de, ate: somarDias(de, 6) };
    }
    case "semana_passada": {
      const de = somarDias(inicioDaSemana(hoje), -7);
      return { de, ate: somarDias(de, 6) };
    }
    case "este_mes": return { de: inicioDoMes(hoje), ate: fimDoMes(hoje) };
    case "mes_passado": {
      const ate = somarDias(inicioDoMes(hoje), -1);
      return { de: inicioDoMes(ate), ate };
    }
    case "este_trimestre": return { de: inicioDoTrimestre(hoje), ate: fimDoTrimestre(hoje) };
    case "trimestre_passado": {
      const ate = somarDias(inicioDoTrimestre(hoje), -1);
      return { de: inicioDoTrimestre(ate), ate };
    }
    case "este_ano": return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
    case "ano_passado": return { de: `${ano - 1}-01-01`, ate: `${ano - 1}-12-31` };
  }
}

/** Período do jeito que o modelo mandou → algo concreto. `invalido` = mandou algo que não entendemos. */
export function resolverPeriodo(bruto: unknown, hoje: string): { periodo: PeriodoResolvido; invalido: boolean } {
  if (bruto === undefined || bruto === null || bruto === "" || bruto === "painel") return { periodo: { tipo: "painel" }, invalido: false };
  if (bruto === "tudo") return { periodo: { tipo: "tudo" }, invalido: false };
  if (typeof bruto === "object" && !Array.isArray(bruto)) {
    const b = bruto as Record<string, unknown>;
    if (b.ultimosDias !== undefined) {
      const n = Math.round(Number(b.ultimosDias));
      if (Number.isFinite(n) && n >= 1 && n <= 3650) {
        return { periodo: { tipo: "ultimos", dias: n, de: somarDias(hoje, -(n - 1)), ate: hoje }, invalido: false };
      }
      return { periodo: { tipo: "painel" }, invalido: true };
    }
    if (typeof b.relativo === "string" && (PERIODOS_RELATIVOS as readonly string[]).includes(b.relativo)) {
      const r = b.relativo as PeriodoRelativo;
      return { periodo: { tipo: "intervalo", ...intervaloRelativo(r, hoje), relativo: r }, invalido: false };
    }
    const de = typeof b.de === "string" ? b.de : "";
    const ate = typeof b.ate === "string" ? b.ate : "";
    if (dataExiste(de) && dataExiste(ate)) {
      return { periodo: { tipo: "intervalo", ...(de <= ate ? { de, ate } : { de: ate, ate: de }) }, invalido: false };
    }
  }
  return { periodo: { tipo: "painel" }, invalido: true };
}

// ── Validação ──────────────────────────────────────────────────────────────

export interface ConsultaDaIa {
  /** Pronta para o montador (período "últimos N dias" vira condição que rola com o tempo). */
  consulta: Consulta;
  tipo: TipoDeCartao;
  titulo: string;
  explicacao: string;
  avisos: string[];
  periodo: PeriodoResolvido;
  /** A consulta antes de virar cartão: período ainda como intervalo. Base dos filtros do painel. */
  base: Consulta;
}

function dataBr(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? limpo(v, max) : "";
}

/** Que valores uma lista aceita nesta org. null = qualquer (texto livre). */
function valoresPermitidos(campo: CampoDeFiltro, c: CatalogoDoCrm): Set<string> | null {
  switch (campo.opcoes) {
    case "funis": return new Set(c.funis.map((f) => f.id));
    case "etapas": return new Set(c.funis.flatMap((f) => f.stages.map((s) => s.id)));
    case "tiposEtapa": return new Set(["open", "won", "lost"]);
    case "membros": return new Set([SEM_VALOR, ...c.membros.map((m) => m.id)]);
    case "empresas": return new Set([SEM_VALOR, ...c.empresas.map((e) => e.id)]);
    case "etiquetas": return new Set(c.etiquetas.map((e) => e.id));
    case "canais": return new Set(c.canais);
    case "campo": return new Set((campo.def?.options ?? []).map((o) => o.value));
  }
  return null;
}

/** Uma condição sugerida pelo modelo, conferida contra o catálogo. null = descartada (motivo em avisos). */
function validarCondicao(bruta: unknown, c: CatalogoDoCrm, avisos: string[]): FiltroDeConsulta | null {
  const nomeBruto = bruta && typeof bruta === "object" ? texto((bruta as Record<string, unknown>).campo, 44) : "";
  const saneada = sanearCondicao(bruta);
  if (!saneada) {
    avisos.push(`Deixei de fora uma condição que não consegui montar${nomeBruto ? ` (${nomeBruto})` : ""}.`);
    return null;
  }
  const campo = campoDeFiltro(saneada.campo, c.campos);
  if (!campo) {
    avisos.push(`Não existe o campo "${saneada.campo.replace(/^cf:/, "")}" nos seus negócios; deixei essa condição de fora.`);
    return null;
  }
  const f = normalizarCondicao(saneada, campo.tipo);
  if (!operadoresDoCampo(campo).some((o) => o.id === f.op)) {
    avisos.push(`A condição em "${campo.rotulo}" usava uma comparação que não cabe nesse campo; deixei de fora.`);
    return null;
  }
  if (f.op === "preenchido" || f.op === "vazio") return { campo: f.campo, op: f.op };

  if (campo.tipo === "lista" || campo.tipo === "multi") {
    const permitidos = valoresPermitidos(campo, c);
    const valores = f.valores ?? [];
    const bons = permitidos ? valores.filter((v) => permitidos.has(v)) : valores;
    if (bons.length < valores.length) {
      avisos.push(`Ignorei ${valores.length - bons.length === 1 ? "um item" : "alguns itens"} de "${campo.rotulo}" que não existe${valores.length - bons.length === 1 ? "" : "m"} na sua conta.`);
    }
    if (bons.length === 0) return null;
    return { campo: f.campo, op: f.op, valores: bons };
  }

  if (campo.tipo === "sim_nao") {
    if (f.valor !== "true" && f.valor !== "false") {
      avisos.push(`"${campo.rotulo}" é sim ou não; deixei a condição de fora.`);
      return null;
    }
    return { campo: f.campo, op: "eq", valor: f.valor };
  }

  if (campo.tipo === "numero" && f.op !== "ultimos" && f.op !== "proximos") {
    const ok = Number.isFinite(parseNumero(f.valor ?? "")) && (f.op !== "entre" || Number.isFinite(parseNumero(f.ate ?? "")));
    if (!ok) {
      avisos.push(`O número da condição em "${campo.rotulo}" não fazia sentido; deixei de fora.`);
      return null;
    }
  }
  if (campo.tipo === "data" && f.op !== "ultimos" && f.op !== "proximos") {
    const ok = dataExiste(f.valor ?? "") && (f.op !== "entre" || dataExiste(f.ate ?? ""));
    if (!ok) {
      avisos.push(`A data da condição em "${campo.rotulo}" não existe; deixei de fora.`);
      return null;
    }
  }
  if (!f.valor) return null;
  return { campo: f.campo, op: f.op, valor: f.valor, ...(f.op === "entre" && f.ate ? { ate: f.ate } : {}) };
}

function validarFiltros(bruto: unknown, c: CatalogoDoCrm, avisos: string[]): Consulta["filtros"] {
  if (!bruto || typeof bruto !== "object") return { logica: "e", grupos: [] };
  // Lista solta de condições (formato antigo) = um grupo "e".
  const b = (Array.isArray(bruto) ? { logica: "e", grupos: [{ logica: "e", condicoes: bruto }] } : bruto) as Record<string, unknown>;
  const gruposBrutos = Array.isArray(b.grupos) ? b.grupos : [];
  if (gruposBrutos.length > LIMITE_DE_GRUPOS) avisos.push(`Usei só os ${LIMITE_DE_GRUPOS} primeiros grupos de condições.`);
  const grupos: GrupoDeFiltros[] = [];
  for (const g of gruposBrutos.slice(0, LIMITE_DE_GRUPOS)) {
    const gg = (g ?? {}) as Record<string, unknown>;
    const brutas = Array.isArray(gg.condicoes) ? gg.condicoes : [];
    if (brutas.length > LIMITE_DE_CONDICOES) avisos.push(`Usei só as ${LIMITE_DE_CONDICOES} primeiras condições de um grupo.`);
    const condicoes = brutas
      .slice(0, LIMITE_DE_CONDICOES)
      .map((x) => validarCondicao(x, c, avisos))
      .filter((x): x is FiltroDeConsulta => !!x);
    if (condicoes.length) grupos.push({ logica: gg.logica === "ou" ? "ou" : "e", condicoes });
  }
  return { logica: b.logica === "ou" ? "ou" : "e", grupos };
}

const CAMPO_DA_DATA_BASE = { criacao: "criadoEm", fechamento: "fechadoEm", previsao: "previsao" } as const;

/**
 * "Últimos 90 dias" num cartão salvo tem de continuar sendo os últimos 90 dias
 * no mês que vem. Intervalo fixo envelhece; então vira condição "nos últimos
 * N dias" na data que conta. Só não dá quando a árvore de filtros é "ou" entre
 * grupos (não há onde pendurar um "e") ou quando o cartão compara com o
 * período anterior (comparar precisa de período).
 */
function comPeriodoRolante(base: Consulta, dias: number, avisos: string[]): Consulta {
  const { filtros } = base;
  const condicao: FiltroDeConsulta = { campo: CAMPO_DA_DATA_BASE[dataBaseEfetiva(base)], op: "ultimos", valor: String(dias) };
  const cabe = !base.comparar && (filtros.logica === "e" || filtros.grupos.length <= 1) && filtros.grupos.length < LIMITE_DE_GRUPOS;
  if (cabe) {
    return { ...base, periodo: "tudo", filtros: { logica: "e", grupos: [...filtros.grupos, { logica: "e", condicoes: [condicao] }] } };
  }
  if (typeof base.periodo === "object") avisos.push(`O período ficou fixo de ${dataBr(base.periodo.de)} a ${dataBr(base.periodo.ate)}.`);
  return base;
}

/**
 * Confere a resposta do modelo e devolve uma consulta segura, ou null quando
 * não sobra nada aproveitável. Tudo que é descartado vira aviso em português.
 */
export function validarRespostaDaIa(resposta: Record<string, unknown>, c: CatalogoDoCrm, hoje: string): ConsultaDaIa | null {
  const avisos: string[] = [];
  const bruto = resposta.consulta;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const defs = new Map(c.campos.map((d) => [d.key, d]));

  let medida = MEDIDAS.find((m) => m.id === b.medida)?.id;
  if (!medida) {
    avisos.push("Não entendi o que medir; deixei como quantidade de negócios.");
    medida = "contagem";
  }

  let campo: string | undefined;
  if (medidaPrecisaCampo(medida)) {
    const cb = texto(b.campo, 44);
    const def = cb.startsWith("cf:") ? defs.get(cb.slice(3)) : undefined;
    if (cb === "valor" || cb === "ponderado" || (def && TIPOS_NUMERICOS.has(def.type))) campo = cb;
    else {
      avisos.push(cb ? `O campo "${cb.replace(/^cf:/, "")}" não é um número que dê para somar; usei o valor do negócio.` : "Usei o valor do negócio como base do cálculo.");
      campo = "valor";
    }
  }

  let agrupar = texto(b.agrupar, 44);
  if (agrupar) {
    const base = AGRUPAMENTOS_BASE.some((a) => a.id && a.id === agrupar);
    const def = agrupar.startsWith("cf:") ? defs.get(agrupar.slice(3)) : undefined;
    if (!base && !(def && TIPOS_AGRUPAVEIS.has(def.type))) {
      avisos.push(`Não achei "${agrupar.replace(/^cf:/, "")}" para separar os números; o cartão ficou sem separar.`);
      agrupar = "";
    }
  }

  let status = STATUS.find((s) => s.id === b.status)?.id ?? "todos";

  const funisDaOrg = new Set(c.funis.map((f) => f.id));
  const funisBrutos = Array.isArray(b.funilIds) ? b.funilIds.map((x) => String(x)) : [];
  const funilIds = [...new Set(funisBrutos.filter((id) => funisDaOrg.has(id)))].slice(0, 20);
  if (funilIds.length < new Set(funisBrutos).size) avisos.push("Ignorei um funil que não existe na sua conta.");

  const { periodo, invalido } = resolverPeriodo(b.periodo, hoje);
  if (invalido) avisos.push("Não entendi o período; usei o período escolhido no painel.");

  let dataBase = DATAS_BASE.find((d) => d.id === b.dataBase)?.id;
  // Mesma regra do montador: taxa de ganho só existe entre fechados, pela data de fechamento.
  if (medida === "taxaGanho") {
    status = "todos";
    dataBase = "fechamento";
  }

  const filtros = validarFiltros(b.filtros, c, avisos);

  const periodoDaConsulta: Consulta["periodo"] =
    periodo.tipo === "painel" || periodo.tipo === "tudo" ? periodo.tipo : { de: periodo.de, ate: periodo.ate };
  const comparar = b.comparar === true && !agrupar && periodoDaConsulta !== "tudo";

  // Passa pelo mesmo saneamento de qualquer consulta vinda do navegador.
  const base = sanearConsulta({ medida, campo, agrupar, status, funilIds, periodo: periodoDaConsulta, dataBase, filtros, comparar });
  if (!base) return null;

  if (periodo.tipo === "intervalo" && periodo.relativo) {
    avisos.push(`Usei de ${dataBr(periodo.de)} a ${dataBr(periodo.ate)}. Se quiser que o cartão siga o período do painel, troque em "Período".`);
  }
  const consulta = periodo.tipo === "ultimos" ? comPeriodoRolante(base, periodo.dias, avisos) : base;

  const permitidos = tiposPermitidos(consulta);
  const tipoPedido = texto(resposta.tipo, 10) as TipoDeCartao;
  const tipo = permitidos.includes(tipoPedido) ? tipoPedido : permitidos.includes("barras") ? "barras" : permitidos[0];

  const naoEntendi = Array.isArray(resposta.naoEntendi) ? resposta.naoEntendi : [];
  for (const n of naoEntendi.slice(0, 4)) {
    const t = texto(n, 160);
    if (t) avisos.push(`Não consegui representar: ${t}`);
  }

  return {
    consulta,
    base,
    tipo,
    titulo: texto(resposta.titulo, 80),
    explicacao: texto(resposta.explicacao, 300),
    avisos: [...new Set(avisos)].slice(0, 8),
    periodo,
  };
}

// ── Filtros globais do painel ──────────────────────────────────────────────

export interface FiltrosGlobaisDaIa {
  globais: FiltrosGlobais;
  /** O que o pedido tinha que só cabe num cartão, em português. Vazio = coube tudo na barra. */
  sobras: string[];
  avisos: string[];
}

export function rotulosDoCatalogo(c: CatalogoDoCrm): RotulosDaConsulta {
  return { campos: c.campos, funis: c.funis, membros: c.membros, empresas: c.empresas, etiquetas: c.etiquetas };
}

/**
 * A barra do painel só sabe período, funis e responsáveis. O que o pedido não
 * menciona continua como está; o resto (valor, etapa, campo personalizado,
 * medida, agrupamento, situação) vira "sobra", para sugerir um cartão.
 */
export function derivarFiltrosGlobais(r: ConsultaDaIa, c: CatalogoDoCrm, atuais: FiltrosGlobais): FiltrosGlobaisDaIa {
  const sobras: string[] = [];
  const avisos: string[] = [];
  const rotulos = rotulosDoCatalogo(c);
  const { base } = r;

  // Período
  let periodo: Pick<FiltrosGlobais, "dias" | "de" | "ate"> = { dias: atuais.dias, de: atuais.de, ate: atuais.ate };
  const p = r.periodo;
  if (p.tipo === "ultimos") {
    periodo = PRESETS_DE_DIAS.includes(p.dias) ? { dias: p.dias } : { dias: atuais.dias, de: p.de, ate: p.ate };
  } else if (p.tipo === "intervalo") {
    periodo = { dias: atuais.dias, de: p.de, ate: p.ate };
  } else if (p.tipo === "tudo") {
    periodo = { dias: 365 };
    avisos.push("O painel mostra no máximo 12 meses; deixei em 12 meses.");
  }

  // Funis e responsáveis: só quando a árvore é um grande "e" (senão "funil X ou valor > Y" mudaria de sentido).
  let funis = [...base.funilIds];
  let donos: string[] = [];
  const simples = base.filtros.logica === "e" || base.filtros.grupos.length <= 1;
  for (const g of base.filtros.grupos) {
    const grupoE = g.logica === "e" || g.condicoes.length === 1;
    for (const f of g.condicoes) {
      if (simples && grupoE && f.op === "qualquer" && f.campo === "funil") funis.push(...(f.valores ?? []));
      else if (simples && grupoE && f.op === "qualquer" && f.campo === "responsavel") donos.push(...(f.valores ?? []));
      else sobras.push(descreverCondicao(f, rotulos));
    }
  }
  funis = [...new Set(funis)];
  donos = [...new Set(donos)];

  if (base.medida !== "contagem") sobras.push(`medir ${MEDIDAS.find((m) => m.id === base.medida)?.rotulo.toLowerCase()}`);
  if (base.agrupar) {
    const rot = AGRUPAMENTOS_BASE.find((a) => a.id === base.agrupar)?.rotulo ?? `Por ${c.campos.find((d) => `cf:${d.key}` === base.agrupar)?.label ?? "campo"}`;
    sobras.push(rot.toLowerCase());
  }
  if (base.status !== "todos") sobras.push(`só negócios ${STATUS.find((s) => s.id === base.status)?.rotulo.toLowerCase()}`);

  const globais = sanearFiltrosGlobais({
    dias: periodo.dias,
    de: periodo.de,
    ate: periodo.ate,
    funis: funis.length ? funis : atuais.funis,
    donos: donos.length ? donos : atuais.donos,
  });
  return { globais, sobras, avisos };
}
