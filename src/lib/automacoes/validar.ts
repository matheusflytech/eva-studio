import { acaoDoTipo, camposVisiveis, EVENTOS_DE_ESPERA, gatilhoDoTipo, type CampoDeConfig } from "./catalogo";
import { data, gruposDaRegra, numero, SEM_VALOR } from "./condicoes";
import { OBJETOS, OPERADORES, saidasDe, UNIDADES, type Definicao, type No, type Regra } from "./tipos";
import { problemasDasVariaveis, variaveisDoTexto } from "./variaveis";

// ---------------------------------------------------------------------------
// Pendências da automação. Nunca bloqueiam a edição; erro bloqueia publicar,
// aviso só aparece. `no` = id do passo, "gatilho" ou null (a automação toda).
//
// Recebe JSON vindo da tela: antes de caminhar pela árvore, confere a forma
// de cada nó. Forma errada vira pendência, nunca exceção.
// ---------------------------------------------------------------------------

export interface Pendencia {
  no: string | "gatilho" | null;
  nivel: "erro" | "aviso";
  mensagem: string;
}

export const MAX_NOS = 200;
const DIA_MS = 86_400_000;
const MS_DA_UNIDADE: Record<string, number> = { minutos: 60_000, horas: 3_600_000, dias: DIA_MS, dias_uteis: DIA_MS };

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ehSaida = (v: unknown) => v === null || v === undefined || typeof v === "string";

function faltando(campos: CampoDeConfig[], config: Record<string, unknown>): string[] {
  return camposVisiveis(campos, config)
    .filter((c) => c.obrigatorio && vazio(config[c.chave] ?? c.padrao))
    .map((c) => c.rotulo);
}

const regraBemFormada = (r: unknown) =>
  ehObjeto(r) && Array.isArray(r.grupos) && r.grupos.every((g) => ehObjeto(g) && Array.isArray(g.condicoes) && g.condicoes.every(ehObjeto));

/** Forma mínima de cada tipo de nó. Sem ela, nem dá para saber as saídas. */
function problemaDeForma(chave: string, no: unknown): string | null {
  if (!ehObjeto(no)) return "Passo inválido.";
  if (no.id !== chave) return "Id do passo não bate com a chave.";
  if (chave === "gatilho") return "“gatilho” é reservado e não pode ser id de passo.";
  switch (no.tipo) {
    case "acao":
      if (typeof no.acao !== "string" || !ehObjeto(no.config) || !ehSaida(no.proximo) || !ehSaida(no.erro)) return "Ação malformada.";
      return null;
    case "condicao":
      if (!regraBemFormada(no.regra) || !ehSaida(no.sim) || !ehSaida(no.nao)) return "Condição malformada.";
      return null;
    case "caminhos": {
      if (!Array.isArray(no.caminhos) || !ehSaida(no.senao)) return "Caminhos malformado.";
      const ids = no.caminhos.map((c) => (ehObjeto(c) ? c.id : undefined));
      if (ids.some((x) => typeof x !== "string" || !x) || new Set(ids).size !== ids.length) return "Cada caminho precisa de um id único.";
      if (!no.caminhos.every((c) => ehObjeto(c) && regraBemFormada(c.regra) && ehSaida(c.proximo))) return "Caminho malformado.";
      return null;
    }
    case "espera":
      if (!ehObjeto(no.config) || !ehSaida(no.proximo)) return "Espera malformada.";
      return null;
    case "esperar_evento":
      if (typeof no.evento !== "string" || !ehObjeto(no.prazo) || !ehSaida(no.aconteceu) || !ehSaida(no.esgotou)) return "Espera por evento malformada.";
      return null;
    case "fim":
      return null;
    default:
      return "Tipo de passo desconhecido.";
  }
}

/** Variável de passo (passos.<id>...) só de passo que vem antes no mesmo caminho. */
function conferirPassoAnterior(caminho: string, anteriores: string[], no: string, p: Pendencia[]) {
  const m = caminho.match(/^passos\.([^.]+)/);
  if (m && !anteriores.includes(m[1])) p.push({ no, nivel: "erro", mensagem: `A variável {{${caminho}}} usa um passo que não vem antes deste.` });
}

function conferirRegra(regra: Regra, onde: string, no: string, anteriores: string[], p: Pendencia[]) {
  const grupos = gruposDaRegra(regra);
  if (grupos.length === 0) {
    p.push({ no, nivel: "aviso", mensagem: `${onde}: sem condição, vale sempre.` });
    return;
  }
  if (grupos.length !== regra.grupos.length) p.push({ no, nivel: "aviso", mensagem: `${onde}: há grupo sem condição (é ignorado).` });
  for (const g of grupos) {
    for (const c of g.condicoes) {
      if (typeof c.campo !== "string" || !c.campo) {
        p.push({ no, nivel: "erro", mensagem: `${onde}: escolha o campo da condição.` });
        continue;
      }
      conferirPassoAnterior(c.campo, anteriores, no, p);
      if (!(OPERADORES as readonly string[]).includes(c.operador)) p.push({ no, nivel: "erro", mensagem: `${onde}: operador desconhecido.` });
      else if (SEM_VALOR.has(c.operador)) continue;
      else if (c.operador === "entre") {
        if (!Array.isArray(c.valor) || c.valor.length !== 2 || c.valor.some(vazio)) p.push({ no, nivel: "erro", mensagem: `${onde}: “está entre” precisa de dois valores.` });
      } else if (c.operador === "ultimos_dias") {
        const n = numero(c.valor);
        if (n === null || n <= 0) p.push({ no, nivel: "erro", mensagem: `${onde}: “nos últimos dias” precisa de um número de dias.` });
      } else if ((c.operador === "antes" || c.operador === "depois") && data(c.valor) === null && !/\{\{/.test(String(c.valor ?? ""))) {
        p.push({ no, nivel: "erro", mensagem: `${onde}: data inválida (use AAAA-MM-DD).` });
      } else if (vazio(c.valor)) p.push({ no, nivel: "erro", mensagem: `${onde}: falta o valor da condição.` });
    }
  }
}

/** Quanto tempo uma espera soma no caminho de cada saída (para o aviso da janela de 24h). */
function esperaNaSaida(no: No, saida: string, acumulado: number): number {
  if (no.tipo === "esperar_evento") {
    // Cliente respondeu: a janela acabou de abrir.
    if (saida === "aconteceu") return no.evento === "message.received" ? 0 : acumulado;
    return acumulado + (Number(no.prazo?.quantidade) || 0) * (MS_DA_UNIDADE[no.prazo?.unidade] ?? DIA_MS);
  }
  if (no.tipo !== "espera") return acumulado;
  const c = no.config;
  if (c.modo === "duracao") return acumulado + (Number(c.quantidade) || 0) * (MS_DA_UNIDADE[c.unidade] ?? DIA_MS);
  return Number.POSITIVE_INFINITY;
}

function textosDaConfig(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(textosDaConfig);
  if (v && typeof v === "object") return Object.values(v).flatMap(textosDaConfig);
  return [];
}

export function validar(def: Definicao): Pendencia[] {
  const p: Pendencia[] = [];
  if (!ehObjeto(def) || !ehObjeto(def.nos)) return [{ no: null, nivel: "erro", mensagem: "Definição inválida." }];
  if (!(OBJETOS as readonly string[]).includes(def.objeto)) p.push({ no: null, nivel: "erro", mensagem: "Tipo de registro desconhecido." });

  // ---- gatilho ----
  const g = def.gatilho;
  const itemDoGatilho = ehObjeto(g) && typeof g.tipo === "string" ? gatilhoDoTipo(g.tipo) : undefined;
  if (!g) p.push({ no: "gatilho", nivel: "erro", mensagem: "Escolha o gatilho: o que faz a automação começar." });
  else if (!itemDoGatilho) p.push({ no: "gatilho", nivel: "erro", mensagem: "Gatilho desconhecido." });
  else if (itemDoGatilho.objeto !== def.objeto) p.push({ no: "gatilho", nivel: "erro", mensagem: "Este gatilho é de outro tipo de registro." });
  else for (const f of faltando(itemDoGatilho.campos, ehObjeto(g.config) ? g.config : {})) p.push({ no: "gatilho", nivel: "erro", mensagem: `Gatilho: falta ${f}.` });

  // ---- forma: com nó malformado não dá para caminhar ----
  const ids = Object.keys(def.nos);
  if (ids.length > MAX_NOS) p.push({ no: null, nivel: "erro", mensagem: `Mais de ${MAX_NOS} passos. Divida em duas automações.` });
  const malformados = ids.map((id) => [id, problemaDeForma(id, def.nos[id])] as const).filter(([, m]) => m);
  for (const [id, m] of malformados) p.push({ no: id, nivel: "erro", mensagem: m! });
  if (malformados.length || (def.inicio !== null && typeof def.inicio !== "string")) {
    if (def.inicio !== null && typeof def.inicio !== "string") p.push({ no: "gatilho", nivel: "erro", mensagem: "Primeiro passo inválido." });
    return p;
  }

  // ---- estrutura: um pai, sem ciclo, tudo alcançável ----
  const pais = new Map<string, number>();
  if (def.inicio) pais.set(def.inicio, 1);
  for (const no of Object.values(def.nos)) {
    for (const s of saidasDe(no)) {
      if (!s.alvo) continue;
      if (!def.nos[s.alvo]) p.push({ no: no.id, nivel: "erro", mensagem: "Liga para um passo que não existe." });
      pais.set(s.alvo, (pais.get(s.alvo) ?? 0) + 1);
    }
  }
  if (def.inicio && !def.nos[def.inicio]) p.push({ no: "gatilho", nivel: "erro", mensagem: "O primeiro passo não existe." });
  for (const [id, n] of pais) if (n > 1) p.push({ no: id, nivel: "erro", mensagem: "Passo com mais de uma entrada." });

  // Caminhada a partir do início: acha soltos e ciclos, e leva junto o que já
  // aconteceu antes (passos anteriores, tempo de espera acumulado).
  const visitados = new Set<string>();
  const caminhar = (id: string | null, anteriores: string[], esperaMs: number, pilha: Set<string>) => {
    if (!id || !def.nos[id]) return;
    if (pilha.has(id)) {
      p.push({ no: id, nivel: "erro", mensagem: "Este passo volta para um passo anterior (ciclo)." });
      return;
    }
    if (visitados.has(id)) return;
    visitados.add(id);
    const no = def.nos[id];
    conferirNo(def, no, anteriores, esperaMs, p);
    const proxima = new Set(pilha).add(id);
    for (const s of saidasDe(no)) caminhar(s.alvo, [...anteriores, id], esperaNaSaida(no, s.saida, esperaMs), proxima);
  };
  caminhar(def.inicio, [], 0, new Set());
  for (const id of ids) if (!visitados.has(id)) p.push({ no: id, nivel: "erro", mensagem: "Passo solto: nada chega até ele." });
  if (!def.inicio) p.push({ no: "gatilho", nivel: "aviso", mensagem: "Ainda não há nenhum passo depois do gatilho." });

  // ---- automação que se realimenta ----
  if (g && itemDoGatilho && g.tipo.endsWith(".field_changed") && g.config?.campo) {
    for (const no of Object.values(def.nos)) {
      if (no.tipo !== "acao" || no.acao !== "record.update_fields") continue;
      const campos = Array.isArray(no.config.campos) ? (no.config.campos as { campo?: string }[]) : [];
      if (campos.some((c) => c?.campo === g.config.campo)) {
        p.push({ no: no.id, nivel: "aviso", mensagem: "Altera o mesmo campo que dispara a automação. Mudança feita por ela mesma não redispara, mas confira se é isso." });
      }
    }
  }
  return p;
}

function conferirNo(def: Definicao, no: No, anteriores: string[], esperaMs: number, p: Pendencia[]) {
  const id = no.id;
  switch (no.tipo) {
    case "acao": {
      const item = acaoDoTipo(no.acao);
      if (!item) {
        p.push({ no: id, nivel: "erro", mensagem: "Ação desconhecida." });
        break;
      }
      if (!item.objetos.includes(def.objeto)) p.push({ no: id, nivel: "erro", mensagem: `“${item.nome}” não vale para este tipo de registro.` });
      for (const f of faltando(item.campos, no.config)) p.push({ no: id, nivel: "erro", mensagem: `${item.nome}: falta ${f}.` });
      if (item.tipo === "whatsapp.send" && no.config.modo !== "modelo" && esperaMs >= DIA_MS) {
        p.push({ no: id, nivel: "aviso", mensagem: "Depois de uma espera de 24h ou mais a janela do WhatsApp oficial costuma estar fechada: prefira um modelo aprovado." });
      }
      for (const texto of textosDaConfig(no.config)) {
        for (const v of variaveisDoTexto(texto)) conferirPassoAnterior(v.caminho, anteriores, id, p);
        for (const m of problemasDasVariaveis(texto)) p.push({ no: id, nivel: "erro", mensagem: m });
      }
      break;
    }
    case "condicao":
      conferirRegra(no.regra, "Condição", id, anteriores, p);
      break;
    case "caminhos":
      if (no.caminhos.length === 0) p.push({ no: id, nivel: "erro", mensagem: "Precisa de pelo menos um caminho." });
      for (const c of no.caminhos) {
        if (typeof c.nome !== "string" || !c.nome.trim()) p.push({ no: id, nivel: "erro", mensagem: "Dê um nome a cada caminho." });
        conferirRegra(c.regra, `Caminho “${c.nome || "sem nome"}”`, id, anteriores, p);
      }
      break;
    case "espera": {
      const c = no.config;
      if (c.modo === "duracao") {
        if (!(Number(c.quantidade) > 0)) p.push({ no: id, nivel: "erro", mensagem: "Espera: informe quanto tempo." });
        if (!(UNIDADES as readonly string[]).includes(c.unidade)) p.push({ no: id, nivel: "erro", mensagem: "Espera: unidade inválida." });
      } else if (c.modo === "ate_data") {
        if (data(c.data) === null) p.push({ no: id, nivel: "erro", mensagem: "Espera: data inválida (use AAAA-MM-DD)." });
      } else if (c.modo === "relativa_campo") {
        if (typeof c.campo !== "string" || !c.campo) p.push({ no: id, nivel: "erro", mensagem: "Espera: escolha o campo de data." });
        else conferirPassoAnterior(c.campo, anteriores, id, p);
        if (!Number.isFinite(c.dias)) p.push({ no: id, nivel: "erro", mensagem: "Espera: informe os dias." });
      } else p.push({ no: id, nivel: "erro", mensagem: "Espera: modo inválido." });
      break;
    }
    case "esperar_evento": {
      const ev = EVENTOS_DE_ESPERA.find((e) => e.tipo === no.evento);
      if (!ev) p.push({ no: id, nivel: "erro", mensagem: "Escolha o que esperar." });
      else if (!ev.objetos.includes(def.objeto)) p.push({ no: id, nivel: "erro", mensagem: "Este evento não acontece neste tipo de registro." });
      if (!(Number(no.prazo.quantidade) > 0)) p.push({ no: id, nivel: "erro", mensagem: "Defina o prazo máximo da espera (sem prazo a execução ficaria parada para sempre)." });
      else if (!(UNIDADES as readonly string[]).includes(no.prazo.unidade)) p.push({ no: id, nivel: "erro", mensagem: "Prazo da espera: unidade inválida." });
      break;
    }
    case "fim":
      break;
  }
}

export const podePublicar = (p: Pendencia[]) => !p.some((x) => x.nivel === "erro");
