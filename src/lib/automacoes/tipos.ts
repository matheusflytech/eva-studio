// ---------------------------------------------------------------------------
// Definição de uma automação (o que fica em Automacao.rascunho e
// AutomacaoVersao.definicao).
//
// Árvore guardada como mapa de nós por id estável + ponteiros de saída. Cada
// nó tem no máximo um pai e não há ciclo (validar.ts confere): é o que deixa
// o layout automático e impede passo órfão ou fio solto.
//
// Sem `server-only`: tela e servidor usam os mesmos tipos e operações.
// ---------------------------------------------------------------------------

export const VERSAO_DO_ESQUEMA = 1;

export const OBJETOS = ["deal", "contact", "company", "task", "conversation"] as const;
export type Objeto = (typeof OBJETOS)[number];

/** Gatilho: tipo do catálogo + configuração (etapa, campo, palavra...). */
export interface Gatilho {
  tipo: string;
  config: Record<string, unknown>;
}

// ---- condições (sem eval: árvore de comparação) ----

export const OPERADORES = [
  "igual",
  "diferente",
  "contem",
  "nao_contem",
  "comeca_com",
  "vazio",
  "preenchido",
  "maior",
  "maior_igual",
  "menor",
  "menor_igual",
  "entre",
  "em",
  "nao_em",
  "antes",
  "depois",
  "ultimos_dias",
  "verdadeiro",
  "falso",
] as const;
export type Operador = (typeof OPERADORES)[number];

export interface Condicao {
  /** Caminho no contexto: "registro.amount_cents", "contato.tags", "sistema.dia_util". */
  campo: string;
  operador: Operador;
  /** Para "entre": [de, até]. Para "em": lista. */
  valor?: unknown;
}

/** OU de grupos E. Regra vazia (sem grupos) = sempre verdadeira. */
export interface Regra {
  grupos: { condicoes: Condicao[] }[];
}

// ---- nós ----

interface NoBase {
  id: string;
  /** Nome que a pessoa deu ao passo (opcional). */
  rotulo?: string;
}

export interface NoAcao extends NoBase {
  tipo: "acao";
  acao: string;
  config: Record<string, unknown>;
  proximo: string | null;
  /** Caminho de erro opcional. Sem ele, erro definitivo encerra a execução como falha. */
  erro?: string | null;
}

export interface NoCondicao extends NoBase {
  tipo: "condicao";
  regra: Regra;
  sim: string | null;
  nao: string | null;
}

export interface Caminho {
  id: string;
  nome: string;
  regra: Regra;
  proximo: string | null;
}

/** N caminhos: vale o primeiro cuja regra bate; senão, "caso contrário". */
export interface NoCaminhos extends NoBase {
  tipo: "caminhos";
  caminhos: Caminho[];
  senao: string | null;
}

export const UNIDADES = ["minutos", "horas", "dias", "dias_uteis"] as const;
export type Unidade = (typeof UNIDADES)[number];

export type ConfigDeEspera =
  | { modo: "duracao"; quantidade: number; unidade: Unidade }
  | { modo: "ate_data"; data: string }
  /** Relativa a um campo de data do registro: dias antes (negativo) ou depois. */
  | { modo: "relativa_campo"; campo: string; dias: number; hora?: string };

export interface NoEspera extends NoBase {
  tipo: "espera";
  config: ConfigDeEspera;
  proximo: string | null;
}

/** Espera um evento do registro (ex.: cliente respondeu) com prazo: duas saídas. */
export interface NoEsperarEvento extends NoBase {
  tipo: "esperar_evento";
  evento: string;
  prazo: { quantidade: number; unidade: Unidade };
  aconteceu: string | null;
  esgotou: string | null;
}

export interface NoFim extends NoBase {
  tipo: "fim";
}

export type No = NoAcao | NoCondicao | NoCaminhos | NoEspera | NoEsperarEvento | NoFim;
export type TipoDeNo = No["tipo"];

export interface Definicao {
  versaoEsquema: number;
  objeto: Objeto;
  gatilho: Gatilho | null;
  /** Primeiro passo depois do gatilho. */
  inicio: string | null;
  nos: Record<string, No>;
}

/** Onde uma ligação sai: do gatilho ou de uma saída de um nó. */
export interface Ponta {
  de: string | "gatilho";
  /** proximo | sim | nao | erro | senao | aconteceu | esgotou | caminho:<id> */
  saida: string;
}

export function definicaoVazia(objeto: Objeto): Definicao {
  return { versaoEsquema: VERSAO_DO_ESQUEMA, objeto, gatilho: null, inicio: null, nos: {} };
}

/** Id curto e estável para nó ou caminho ("n_k3j9x2ab"). */
export function novoId(prefixo = "n"): string {
  const letras = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefixo}_${Array.from(bytes, (b) => letras[b % letras.length]).join("")}`;
}

/** Saídas de um nó, na ordem em que a tela desenha. */
export function saidasDe(no: No): { saida: string; alvo: string | null; nome: string }[] {
  switch (no.tipo) {
    case "acao":
      return no.erro !== undefined
        ? [
            { saida: "proximo", alvo: no.proximo, nome: "" },
            { saida: "erro", alvo: no.erro ?? null, nome: "Erro" },
          ]
        : [{ saida: "proximo", alvo: no.proximo, nome: "" }];
    case "espera":
      return [{ saida: "proximo", alvo: no.proximo, nome: "" }];
    case "condicao":
      return [
        { saida: "sim", alvo: no.sim, nome: "Sim" },
        { saida: "nao", alvo: no.nao, nome: "Não" },
      ];
    case "caminhos":
      return [
        ...no.caminhos.map((c) => ({ saida: `caminho:${c.id}`, alvo: c.proximo, nome: c.nome })),
        { saida: "senao", alvo: no.senao, nome: "Caso contrário" },
      ];
    case "esperar_evento":
      return [
        { saida: "aconteceu", alvo: no.aconteceu, nome: "Aconteceu" },
        { saida: "esgotou", alvo: no.esgotou, nome: "Tempo esgotado" },
      ];
    case "fim":
      return [];
  }
}

/** Saída "principal": para onde os passos seguintes vão quando se insere ou apaga um nó. */
export function saidaPrincipal(no: No): string | null {
  switch (no.tipo) {
    case "acao":
    case "espera":
      return "proximo";
    case "condicao":
      return "sim";
    case "caminhos":
      return no.caminhos[0] ? `caminho:${no.caminhos[0].id}` : "senao";
    case "esperar_evento":
      return "aconteceu";
    case "fim":
      return null;
  }
}

export function alvoDaSaida(no: No, saida: string): string | null {
  return saidasDe(no).find((s) => s.saida === saida)?.alvo ?? null;
}

/** Cópia com a saída apontando para outro nó (imutável). */
export function comSaida(no: No, saida: string, alvo: string | null): No {
  switch (no.tipo) {
    case "acao":
      if (saida === "erro") return { ...no, erro: alvo };
      return { ...no, proximo: alvo };
    case "espera":
      return { ...no, proximo: alvo };
    case "condicao":
      return saida === "nao" ? { ...no, nao: alvo } : { ...no, sim: alvo };
    case "caminhos":
      if (saida === "senao") return { ...no, senao: alvo };
      return { ...no, caminhos: no.caminhos.map((c) => (`caminho:${c.id}` === saida ? { ...c, proximo: alvo } : c)) };
    case "esperar_evento":
      return saida === "esgotou" ? { ...no, esgotou: alvo } : { ...no, aconteceu: alvo };
    case "fim":
      return no;
  }
}
