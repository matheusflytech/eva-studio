import { alvoDaSaida, comSaida, novoId, saidaPrincipal, saidasDe, type Caminho, type Definicao, type Gatilho, type No, type Ponta } from "./tipos";

// ---------------------------------------------------------------------------
// Edições da automação como operações puras: aplicar(def, op) → nova def.
// Tela e servidor usam as mesmas (desfazer/refazer, validação no servidor,
// auditoria). Nenhuma operação cria passo solto, ciclo ou dois pais.
// ---------------------------------------------------------------------------

export type Operacao =
  | { op: "definir_gatilho"; gatilho: Gatilho }
  /**
   * Coloca um nó numa ligação. O que vinha depois passa a sair de
   * `seguintesPor` (padrão: a saída principal do nó novo).
   */
  | { op: "inserir"; ponta: Ponta; no: No; seguintesPor?: string }
  /** Apaga um nó. Num nó com várias saídas, `manter` diz qual ramo continua; os outros somem. */
  | { op: "apagar"; id: string; manter?: string }
  /** Muda config, rótulo, regra... Não muda id, tipo nem saídas. */
  | { op: "atualizar"; id: string; patch: Record<string, unknown> }
  /** Cópia de uma ação ou espera logo depois dela. */
  | { op: "duplicar"; id: string }
  /** Leva um nó de saída única para outra ligação. */
  | { op: "mover"; id: string; ponta: Ponta }
  | { op: "adicionar_caminho"; id: string; nome?: string }
  | { op: "remover_caminho"; id: string; caminhoId: string };

export class ErroDeOperacao extends Error {}

const SAIDAS_DO_NO = new Set(["acao", "espera"]);

export function pontaAlvo(def: Definicao, p: Ponta): string | null {
  if (p.de === "gatilho") return def.inicio;
  const no = def.nos[p.de];
  if (!no) throw new ErroDeOperacao("Passo de origem não existe.");
  if (!saidasDe(no).some((s) => s.saida === p.saida)) throw new ErroDeOperacao("Saída não existe neste passo.");
  return alvoDaSaida(no, p.saida);
}

function ligar(def: Definicao, p: Ponta, alvo: string | null): Definicao {
  if (p.de === "gatilho") return { ...def, inicio: alvo };
  return { ...def, nos: { ...def.nos, [p.de]: comSaida(def.nos[p.de], p.saida, alvo) } };
}

/** Quem aponta para o nó (no máximo um). */
export function paiDe(def: Definicao, id: string): Ponta | null {
  if (def.inicio === id) return { de: "gatilho", saida: "proximo" };
  for (const no of Object.values(def.nos)) {
    for (const s of saidasDe(no)) if (s.alvo === id) return { de: no.id, saida: s.saida };
  }
  return null;
}

/** O nó e tudo que vem depois dele. */
export function subarvore(def: Definicao, id: string | null, visto = new Set<string>()): Set<string> {
  if (!id || visto.has(id) || !def.nos[id]) return visto;
  visto.add(id);
  for (const s of saidasDe(def.nos[id])) subarvore(def, s.alvo, visto);
  return visto;
}

function semNos(def: Definicao, ids: Set<string>): Definicao {
  const nos = { ...def.nos };
  for (const id of ids) delete nos[id];
  return { ...def, nos };
}

/** Cópia limpa do nó novo: saídas vazias (só as que existem para o tipo). */
function noLimpo(no: No): No {
  let limpo = no;
  for (const s of saidasDe(no)) limpo = comSaida(limpo, s.saida, null);
  return limpo;
}

export function aplicar(def: Definicao, op: Operacao): Definicao {
  switch (op.op) {
    case "definir_gatilho":
      return { ...def, gatilho: op.gatilho };

    case "inserir": {
      if (def.nos[op.no.id]) throw new ErroDeOperacao("Já existe um passo com este id.");
      const seguinte = pontaAlvo(def, op.ponta);
      let novo = noLimpo(op.no);
      if (seguinte) {
        const saida = op.seguintesPor ?? saidaPrincipal(novo);
        if (!saida) throw new ErroDeOperacao("Fim só pode ficar no fim do caminho.");
        if (!saidasDe(novo).some((s) => s.saida === saida)) throw new ErroDeOperacao("Saída não existe no passo novo.");
        novo = comSaida(novo, saida, seguinte);
      }
      const comNo = { ...def, nos: { ...def.nos, [novo.id]: novo } };
      return ligar(comNo, op.ponta, novo.id);
    }

    case "apagar": {
      const no = def.nos[op.id];
      if (!no) throw new ErroDeOperacao("Passo não existe.");
      const pai = paiDe(def, op.id);
      const saidas = saidasDe(no);
      const manter = op.manter ?? saidaPrincipal(no);
      const continua = manter ? (saidas.find((s) => s.saida === manter)?.alvo ?? null) : null;
      // Ramos que não continuam somem com tudo que vem depois deles.
      const apagar = new Set<string>([op.id]);
      for (const s of saidas) if (s.saida !== manter) subarvore(def, s.alvo, apagar);
      let nova = semNos(def, apagar);
      if (pai) nova = ligar(nova, pai, continua);
      return nova;
    }

    case "atualizar": {
      const no = def.nos[op.id];
      if (!no) throw new ErroDeOperacao("Passo não existe.");
      // Saídas e identidade não se mudam por aqui (seria um jeito de criar ciclo).
      const proibido = ["id", "tipo", "proximo", "erro", "sim", "nao", "senao", "aconteceu", "esgotou"];
      const patch = Object.fromEntries(Object.entries(op.patch).filter(([k]) => !proibido.includes(k)));
      let atualizado = { ...no, ...patch } as No;
      if (no.tipo === "caminhos" && Array.isArray(patch.caminhos)) {
        // Mantém o destino de cada caminho que já existia.
        const antigos = new Map(no.caminhos.map((c) => [c.id, c.proximo]));
        const caminhos = (patch.caminhos as Caminho[]).filter((c) => antigos.has(c.id)).map((c) => ({ ...c, proximo: antigos.get(c.id) ?? null }));
        if (caminhos.length !== no.caminhos.length) throw new ErroDeOperacao("Use adicionar/remover caminho para mudar a quantidade.");
        atualizado = { ...(atualizado as typeof no), caminhos };
      }
      if (no.tipo === "acao" && "comErro" in patch) {
        // Liga/desliga o caminho de erro da ação (desligar apaga o ramo de erro).
        const { comErro, ...resto } = patch as { comErro?: boolean };
        const base = { ...no, ...resto };
        if (comErro) return { ...def, nos: { ...def.nos, [no.id]: { ...base, erro: no.erro ?? null } } };
        const semErro: Record<string, unknown> = { ...base };
        delete semErro.erro;
        const limpa = semNos(def, subarvore(def, no.erro ?? null));
        return { ...limpa, nos: { ...limpa.nos, [no.id]: semErro as unknown as No } };
      }
      return { ...def, nos: { ...def.nos, [op.id]: atualizado } };
    }

    case "duplicar": {
      const no = def.nos[op.id];
      if (!no || !SAIDAS_DO_NO.has(no.tipo)) throw new ErroDeOperacao("Só ação e espera podem ser duplicadas.");
      const copia = structuredClone(no) as No;
      copia.id = novoId();
      if (copia.tipo === "acao") delete copia.erro;
      return aplicar(def, { op: "inserir", ponta: { de: no.id, saida: "proximo" }, no: copia });
    }

    case "mover": {
      const no = def.nos[op.id];
      if (!no || !SAIDAS_DO_NO.has(no.tipo)) throw new ErroDeOperacao("Só ação e espera podem ser movidas.");
      if (op.ponta.de === op.id) return def;
      if (no.tipo === "acao" && no.erro) throw new ErroDeOperacao("Esvazie o caminho de erro antes de mover este passo.");
      // Não pode ir para dentro do próprio ramo (de um nó de saída única isso é só "depois dele").
      const tirado = aplicar(def, { op: "apagar", id: op.id });
      if (op.ponta.de !== "gatilho" && !tirado.nos[op.ponta.de]) throw new ErroDeOperacao("Destino não existe.");
      const limpo = { ...no } as Record<string, unknown>;
      delete limpo.erro;
      return aplicar(tirado, { op: "inserir", ponta: op.ponta, no: limpo as unknown as No });
    }

    case "adicionar_caminho": {
      const no = def.nos[op.id];
      if (!no || no.tipo !== "caminhos") throw new ErroDeOperacao("Não é um passo de caminhos.");
      if (no.caminhos.length >= 10) throw new ErroDeOperacao("No máximo 10 caminhos.");
      const caminho: Caminho = { id: novoId("c"), nome: op.nome ?? `Caminho ${no.caminhos.length + 1}`, regra: { grupos: [] }, proximo: null };
      return { ...def, nos: { ...def.nos, [no.id]: { ...no, caminhos: [...no.caminhos, caminho] } } };
    }

    case "remover_caminho": {
      const no = def.nos[op.id];
      if (!no || no.tipo !== "caminhos") throw new ErroDeOperacao("Não é um passo de caminhos.");
      if (no.caminhos.length <= 1) throw new ErroDeOperacao("Precisa de pelo menos um caminho.");
      const caminho = no.caminhos.find((c) => c.id === op.caminhoId);
      if (!caminho) throw new ErroDeOperacao("Caminho não existe.");
      const nova = semNos(def, subarvore(def, caminho.proximo));
      return { ...nova, nos: { ...nova.nos, [no.id]: { ...no, caminhos: no.caminhos.filter((c) => c.id !== op.caminhoId) } } };
    }
  }
}

/** Aplica várias em sequência (desfazer = reaplicar até um ponto). */
export function aplicarTodas(def: Definicao, ops: Operacao[]): Definicao {
  return ops.reduce(aplicar, def);
}
