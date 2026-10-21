import { acaoDoTipo, CAMPOS_DO_CONTEXTO, EVENTOS_DE_ESPERA, gatilhoDoTipo, nomeDe, textoDaDuracao, type Nomes } from "./catalogo";
import { NOME_DO_OPERADOR, SEM_VALOR } from "./condicoes";
import type { Definicao, No, Regra } from "./tipos";

// ---------------------------------------------------------------------------
// A frase do topo de toda automação: "Quando um negócio entrar em Proposta:
// esperar 2 dias úteis; se Etapa é Proposta, mandar o modelo X; senão, parar."
// Ramos aninhados viram "…" depois de dois níveis (a frase é resumo, não o fluxo).
// ---------------------------------------------------------------------------

const PROFUNDIDADE = 2;

function rotuloDoCampo(def: Definicao, caminho: string): string {
  return CAMPOS_DO_CONTEXTO[def.objeto]?.find((c) => c.caminho === caminho)?.rotulo ?? caminho.split(".").pop() ?? caminho;
}

export function fraseDaRegra(def: Definicao, regra: Regra, nomes: Nomes = {}): string {
  const grupos = regra.grupos.filter((g) => g.condicoes.length);
  if (!grupos.length) return "sempre";
  return grupos
    .map((g) =>
      g.condicoes
        .map((c) => {
          const campo = CAMPOS_DO_CONTEXTO[def.objeto]?.find((x) => x.caminho === c.campo);
          const valor = SEM_VALOR.has(c.operador)
            ? ""
            : ` ${campo && ["etapa", "funil", "usuario", "tag"].includes(campo.tipo) ? nomeDe(nomes, campo.tipo as "etapa", c.valor) : Array.isArray(c.valor) ? c.valor.join(" e ") : String(c.valor ?? "…")}`;
          return `${rotuloDoCampo(def, c.campo)} ${NOME_DO_OPERADOR[c.operador]}${valor}`;
        })
        .join(" e ")
    )
    .join(" ou ");
}

function fraseDaEspera(def: Definicao, no: Extract<No, { tipo: "espera" }>, nomes: Nomes): string {
  const c = no.config;
  if (c.modo === "duracao") return `esperar ${textoDaDuracao(c.quantidade, c.unidade)}`;
  if (c.modo === "ate_data") {
    const d = new Date(c.data);
    return Number.isNaN(d.getTime()) ? "esperar até a data" : `esperar até ${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  }
  const campo = nomeDe(nomes, "campo_data", c.campo);
  if (!c.dias) return `esperar até o dia de ${campo}`;
  return c.dias < 0 ? `esperar até ${textoDaDuracao(-c.dias, "dias")} antes de ${campo}` : `esperar até ${textoDaDuracao(c.dias, "dias")} depois de ${campo}`;
}

function fraseDoCaminho(def: Definicao, id: string | null, nomes: Nomes, nivel: number): string[] {
  const partes: string[] = [];
  let atual = id;
  const vistos = new Set<string>();
  while (atual && def.nos[atual] && !vistos.has(atual)) {
    vistos.add(atual);
    const no = def.nos[atual];
    switch (no.tipo) {
      case "acao": {
        const item = acaoDoTipo(no.acao);
        partes.push(no.rotulo?.trim() || (item ? item.frase(no.config ?? {}, nomes) : "ação desconhecida"));
        atual = no.proximo;
        continue;
      }
      case "espera":
        partes.push(fraseDaEspera(def, no, nomes));
        atual = no.proximo;
        continue;
      case "fim":
        partes.push("parar");
        return partes;
      case "condicao": {
        const se = `se ${fraseDaRegra(def, no.regra, nomes)}`;
        if (nivel >= PROFUNDIDADE) {
          partes.push(`${se}, …`);
          return partes;
        }
        const sim = fraseDoCaminho(def, no.sim, nomes, nivel + 1);
        const nao = fraseDoCaminho(def, no.nao, nomes, nivel + 1);
        partes.push(`${se}, ${sim.length ? sim.join(", ") : "nada"}${nao.length ? `; senão, ${nao.join(", ")}` : ""}`);
        return partes;
      }
      case "caminhos":
        partes.push(`dividir em ${no.caminhos.length + 1} caminhos (${[...no.caminhos.map((c) => c.nome), "caso contrário"].join(", ")})`);
        return partes;
      case "esperar_evento": {
        const ev = EVENTOS_DE_ESPERA.find((e) => e.tipo === no.evento)?.nome.toLowerCase() ?? "o evento";
        const espera = `esperar ${ev} por até ${textoDaDuracao(no.prazo.quantidade, no.prazo.unidade)}`;
        if (nivel >= PROFUNDIDADE) {
          partes.push(`${espera}, …`);
          return partes;
        }
        const sim = fraseDoCaminho(def, no.aconteceu, nomes, nivel + 1);
        const nao = fraseDoCaminho(def, no.esgotou, nomes, nivel + 1);
        partes.push(`${espera}${sim.length ? `; se acontecer, ${sim.join(", ")}` : ""}${nao.length ? `; se não, ${nao.join(", ")}` : ""}`);
        return partes;
      }
    }
  }
  return partes;
}

export function fraseDaAutomacao(def: Definicao, nomes: Nomes = {}): string {
  const item = def.gatilho ? gatilhoDoTipo(def.gatilho.tipo) : undefined;
  const quando = item && def.gatilho ? item.frase(def.gatilho.config ?? {}, nomes) : "Quando… (escolha o gatilho)";
  const passos = fraseDoCaminho(def, def.inicio, nomes, 0);
  return passos.length ? `${quando}: ${passos.join("; ")}.` : `${quando}.`;
}
