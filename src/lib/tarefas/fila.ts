// ---------------------------------------------------------------------------
// Fila registro a registro: a pessoa trabalha uma lista na ordem, com "Concluir e próximo" e "Pular".
// Puro: a tela guarda o estado; concluir de verdade (com resultado e próximo
// passo) é o mesmo diálogo de sempre — a fila só decide quem vem depois.
// ---------------------------------------------------------------------------

export interface EstadoDaFila {
  ids: string[];
  /** Índice do registro aberto; -1 = fila acabou. */
  atual: number;
  concluidos: string[];
  pulados: string[];
}

export function iniciarFila(ids: string[], comecarEm?: string): EstadoDaFila {
  const unicos = [...new Set(ids)];
  const i = comecarEm ? unicos.indexOf(comecarEm) : 0;
  return { ids: unicos, atual: unicos.length === 0 ? -1 : Math.max(i, 0), concluidos: [], pulados: [] };
}

export function idAtual(f: EstadoDaFila): string | null {
  return f.atual >= 0 ? f.ids[f.atual] ?? null : null;
}

/** Próximo índice ainda não resolvido depois de `de`; pulado só volta com `voltar`. */
function proximoPendente(f: EstadoDaFila, de: number, resolvidos: Set<string>): number {
  for (let k = de + 1; k < f.ids.length; k++) if (!resolvidos.has(f.ids[k])) return k;
  return -1;
}

/** Concluiu o atual: marca e vai para o próximo pendente. */
export function concluirEProximo(f: EstadoDaFila): EstadoDaFila {
  const id = idAtual(f);
  if (!id) return f;
  const concluidos = f.concluidos.includes(id) ? f.concluidos : [...f.concluidos, id];
  const resolvidos = new Set([...concluidos, ...f.pulados]);
  return { ...f, concluidos, atual: proximoPendente(f, f.atual, resolvidos) };
}

/** Pulou o atual (fica para depois, não conclui). */
export function pular(f: EstadoDaFila): EstadoDaFila {
  const id = idAtual(f);
  if (!id) return f;
  const pulados = f.pulados.includes(id) ? f.pulados : [...f.pulados, id];
  const resolvidos = new Set([...f.concluidos, ...pulados]);
  return { ...f, pulados, atual: proximoPendente(f, f.atual, resolvidos) };
}

/** Reabre um pulado (padrão: o último) como atual; o que estava aberto segue pendente. */
export function voltar(f: EstadoDaFila, id: string | undefined = f.pulados.at(-1)): EstadoDaFila {
  if (!id || !f.pulados.includes(id)) return f;
  const atual = f.ids.indexOf(id);
  if (atual < 0) return f;
  return { ...f, pulados: f.pulados.filter((x) => x !== id), atual };
}

/** Item sumiu da lista (outra pessoa concluiu, adiou): tira da fila sem perder a posição. */
export function removerDaFila(f: EstadoDaFila, id: string): EstadoDaFila {
  const i = f.ids.indexOf(id);
  if (i < 0) return f;
  const atualId = idAtual(f);
  const ids = f.ids.filter((x) => x !== id);
  if (atualId !== id) return { ...f, ids, atual: atualId ? ids.indexOf(atualId) : -1 };
  // Era o aberto: vai para o próximo pendente a partir da mesma posição.
  const resolvidos = new Set([...f.concluidos, ...f.pulados]);
  let atual = -1;
  for (let k = i; k < ids.length; k++) {
    if (!resolvidos.has(ids[k])) {
      atual = k;
      break;
    }
  }
  return { ...f, ids, atual };
}

export function progressoDaFila(f: EstadoDaFila): { feitos: number; total: number } {
  return { feitos: f.concluidos.length, total: f.ids.length };
}
