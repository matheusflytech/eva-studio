import { partesEmSP } from "@/lib/fuso-sp";
import { diaEmSP, noDia, somarDias } from "@/lib/tarefas/calendario";
import { fimDaDuracao } from "./calendario";
import { avaliarRegra, data, lerCaminho, type Contexto } from "./condicoes";
import type { ConfigDeEspera, Definicao, NoAcao } from "./tipos";

// ---------------------------------------------------------------------------
// Interpretador puro: dado o nó atual, o contexto e o relógio, diz o próximo
// movimento. Não toca banco nem executa ação; o executor (servidor) aplica o
// movimento, grava o passo e roda as ações. É o que dá para testar sem banco.
// ---------------------------------------------------------------------------

/** Espera em andamento (guardada nas variáveis da execução). */
export interface EstadoDaEspera {
  noId: string;
  /** ISO: quando a espera acaba (ou o prazo do "esperar evento"). */
  ate: string;
  /** "esperar evento": o evento chegou antes do prazo. */
  resultado?: "aconteceu";
  evento?: Record<string, unknown>;
}

export type Movimento =
  | { tipo: "fim" }
  | { tipo: "acao"; no: NoAcao }
  /** Nó de controle resolvido: segue para `para` pela `saida` (sim, nao, caminho:<id>, aconteceu...). */
  | { tipo: "seguir"; para: string | null; saida: string; detalhe?: Record<string, unknown> }
  /** Para até `ate`. `registrar` = criar a linha de "esperar evento". */
  | { tipo: "esperar"; ate: Date; espera: EstadoDaEspera; registrar?: { evento: string } }
  | { tipo: "erro"; mensagem: string };

const HORA_PADRAO = "09:00";

function hora(texto: unknown): [number, number] {
  const m = String(texto ?? HORA_PADRAO).match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Math.min(23, Number(m[1])) : 9;
  const min = m ? Math.min(59, Number(m[2])) : 0;
  return [h, min];
}

/**
 * Quando a espera termina. null = não dá para calcular (campo de data vazio):
 * o executor segue em frente e registra o motivo, em vez de parar para sempre.
 */
export function fimDaEspera(config: ConfigDeEspera, contexto: Contexto, agora: Date): Date | null {
  if (config.modo === "duracao") return fimDaDuracao(agora, Number(config.quantidade) || 0, config.unidade);
  if (config.modo === "ate_data") {
    const so = /^\d{4}-\d{2}-\d{2}$/.test(String(config.data ?? "").trim());
    if (so) {
      const [a, m, d] = String(config.data).split("-").map(Number);
      const [h, min] = hora(HORA_PADRAO);
      return noDia({ ano: a, mes: m, dia: d }, h, min);
    }
    const t = data(config.data);
    return t === null ? null : new Date(t);
  }
  // Relativa a um campo de data do registro: dias antes (negativo) ou depois, na hora pedida.
  const base = data(lerCaminho(contexto, config.campo));
  if (base === null) return null;
  const dia = somarDias(diaEmSP(new Date(base)), Math.trunc(Number(config.dias) || 0));
  const [h, min] = config.hora ? hora(config.hora) : (() => {
    const p = partesEmSP(new Date(base));
    // Campo só com data (meia-noite): usa a hora padrão.
    return p.hora === 0 && p.minuto === 0 ? hora(HORA_PADRAO) : [p.hora, p.minuto] as [number, number];
  })();
  return noDia(dia, h, min);
}

export function decidir(def: Definicao, noId: string | null, contexto: Contexto, agora: Date, espera?: EstadoDaEspera | null): Movimento {
  if (!noId) return { tipo: "fim" };
  const no = def.nos[noId];
  if (!no) return { tipo: "erro", mensagem: "Passo não existe nesta versão." };
  const minha = espera && espera.noId === no.id ? espera : null;

  switch (no.tipo) {
    case "fim":
      return { tipo: "fim" };
    case "acao":
      return { tipo: "acao", no };
    case "condicao": {
      const sim = avaliarRegra(no.regra, contexto, agora);
      return { tipo: "seguir", para: sim ? no.sim : no.nao, saida: sim ? "sim" : "nao" };
    }
    case "caminhos": {
      // Caminho sem condição vale sempre (a validação avisa).
      const c = no.caminhos.find((x) => avaliarRegra(x.regra, contexto, agora));
      return c ? { tipo: "seguir", para: c.proximo, saida: `caminho:${c.id}`, detalhe: { caminho: c.nome } } : { tipo: "seguir", para: no.senao, saida: "senao" };
    }
    case "espera": {
      if (minha) {
        return agora.getTime() >= Date.parse(minha.ate)
          ? { tipo: "seguir", para: no.proximo, saida: "proximo", detalhe: { esperou_ate: minha.ate } }
          : { tipo: "esperar", ate: new Date(minha.ate), espera: minha };
      }
      const ate = fimDaEspera(no.config, contexto, agora);
      if (!ate) return { tipo: "seguir", para: no.proximo, saida: "proximo", detalhe: { pulou: "campo de data vazio" } };
      if (ate.getTime() <= agora.getTime()) return { tipo: "seguir", para: no.proximo, saida: "proximo", detalhe: { esperou_ate: ate.toISOString(), ja_passou: true } };
      return { tipo: "esperar", ate, espera: { noId: no.id, ate: ate.toISOString() } };
    }
    case "esperar_evento": {
      if (minha) {
        if (minha.resultado === "aconteceu") return { tipo: "seguir", para: no.aconteceu, saida: "aconteceu", detalhe: { evento: minha.evento ?? null } };
        return agora.getTime() >= Date.parse(minha.ate)
          ? { tipo: "seguir", para: no.esgotou, saida: "esgotou" }
          : { tipo: "esperar", ate: new Date(minha.ate), espera: minha };
      }
      const ate = fimDaDuracao(agora, Number(no.prazo.quantidade) || 0, no.prazo.unidade);
      return { tipo: "esperar", ate, espera: { noId: no.id, ate: ate.toISOString() }, registrar: { evento: no.evento } };
    }
  }
}
