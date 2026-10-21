import { acaoDoTipo, camposVisiveis, EVENTOS_DE_ESPERA, gatilhoDoTipo, type CampoDeConfig } from "./catalogo";
import { SEM_VALOR } from "./condicoes";
import { OBJETOS, OPERADORES, saidasDe, UNIDADES, type Definicao, type No, type Regra } from "./tipos";
import { variaveisDoTexto } from "./variaveis";

// ---------------------------------------------------------------------------
// Pendências da automação. Nunca bloqueiam a edição; erro bloqueia publicar,
// aviso só aparece. `no` = id do passo, "gatilho" ou null (a automação toda).
// ---------------------------------------------------------------------------

export interface Pendencia {
  no: string | "gatilho" | null;
  nivel: "erro" | "aviso";
  mensagem: string;
}

export const MAX_NOS = 200;
const DIA_MS = 86_400_000;

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function faltando(campos: CampoDeConfig[], config: Record<string, unknown>): string[] {
  return camposVisiveis(campos, config)
    .filter((c) => c.obrigatorio && vazio(config[c.chave] ?? c.padrao))
    .map((c) => c.rotulo);
}

function conferirRegra(regra: Regra | undefined, onde: string, no: string, p: Pendencia[]) {
  if (!regra || !Array.isArray(regra.grupos)) {
    p.push({ no, nivel: "erro", mensagem: `${onde}: regra inválida.` });
    return;
  }
  if (regra.grupos.length === 0 || regra.grupos.every((g) => g.condicoes.length === 0)) {
    p.push({ no, nivel: "aviso", mensagem: `${onde}: sem condição, vale sempre.` });
    return;
  }
  for (const g of regra.grupos) {
    for (const c of g.condicoes) {
      if (!c.campo) p.push({ no, nivel: "erro", mensagem: `${onde}: escolha o campo da condição.` });
      else if (!(OPERADORES as readonly string[]).includes(c.operador)) p.push({ no, nivel: "erro", mensagem: `${onde}: operador desconhecido.` });
      else if (!SEM_VALOR.has(c.operador) && vazio(c.valor)) p.push({ no, nivel: "erro", mensagem: `${onde}: falta o valor da condição.` });
    }
  }
}

/** Duração aproximada de uma espera em ms (para o aviso da janela de 24h). */
function duracaoDaEspera(no: No): number {
  if (no.tipo === "esperar_evento") {
    const f = { minutos: 60_000, horas: 3_600_000, dias: DIA_MS, dias_uteis: DIA_MS }[no.prazo.unidade] ?? DIA_MS;
    return no.prazo.quantidade * f;
  }
  if (no.tipo !== "espera") return 0;
  const c = no.config;
  if (c.modo === "duracao") return c.quantidade * ({ minutos: 60_000, horas: 3_600_000, dias: DIA_MS, dias_uteis: DIA_MS }[c.unidade] ?? DIA_MS);
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
  if (!(OBJETOS as readonly string[]).includes(def.objeto)) p.push({ no: null, nivel: "erro", mensagem: "Tipo de registro desconhecido." });

  // ---- gatilho ----
  const g = def.gatilho;
  const itemDoGatilho = g ? gatilhoDoTipo(g.tipo) : undefined;
  if (!g) p.push({ no: "gatilho", nivel: "erro", mensagem: "Escolha o gatilho: o que faz a automação começar." });
  else if (!itemDoGatilho) p.push({ no: "gatilho", nivel: "erro", mensagem: "Gatilho desconhecido." });
  else if (itemDoGatilho.objeto !== def.objeto) p.push({ no: "gatilho", nivel: "erro", mensagem: "Este gatilho é de outro tipo de registro." });
  else for (const f of faltando(itemDoGatilho.campos, g.config ?? {})) p.push({ no: "gatilho", nivel: "erro", mensagem: `Gatilho: falta ${f}.` });

  // ---- estrutura: um pai, sem ciclo, tudo alcançável ----
  const ids = Object.keys(def.nos);
  if (ids.length > MAX_NOS) p.push({ no: null, nivel: "erro", mensagem: `Mais de ${MAX_NOS} passos. Divida em duas automações.` });
  const pais = new Map<string, number>();
  if (def.inicio) pais.set(def.inicio, 1);
  for (const no of Object.values(def.nos)) {
    if (no.id !== ids.find((i) => def.nos[i] === no)) p.push({ no: no.id, nivel: "erro", mensagem: "Id do passo não bate com a chave." });
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
    const espera = esperaMs + duracaoDaEspera(no);
    for (const s of saidasDe(no)) caminhar(s.alvo, [...anteriores, id], espera, proxima);
  };
  caminhar(def.inicio, [], 0, new Set());
  for (const id of ids) if (!visitados.has(id)) p.push({ no: id, nivel: "erro", mensagem: "Passo solto: nada chega até ele." });
  if (!def.inicio) p.push({ no: "gatilho", nivel: "aviso", mensagem: "Ainda não há nenhum passo depois do gatilho." });

  // ---- automação que se realimenta ----
  if (g && itemDoGatilho && g.tipo.endsWith(".field_changed") && g.config?.campo) {
    for (const no of Object.values(def.nos)) {
      if (no.tipo !== "acao" || no.acao !== "record.update_fields") continue;
      const campos = Array.isArray(no.config.campos) ? (no.config.campos as { campo?: string }[]) : [];
      if (campos.some((c) => c.campo === g.config.campo)) {
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
      for (const f of faltando(item.campos, no.config ?? {})) p.push({ no: id, nivel: "erro", mensagem: `${item.nome}: falta ${f}.` });
      if (item.tipo === "whatsapp.send" && no.config.modo !== "modelo" && esperaMs >= DIA_MS) {
        p.push({ no: id, nivel: "aviso", mensagem: "Depois de uma espera de 24h ou mais a janela do WhatsApp oficial costuma estar fechada: prefira um modelo aprovado." });
      }
      // Variável de passo só de passo que vem antes no mesmo caminho.
      for (const texto of textosDaConfig(no.config)) {
        for (const v of variaveisDoTexto(texto)) {
          const m = v.caminho.match(/^passos\.([^.]+)/);
          if (m && !anteriores.includes(m[1])) p.push({ no: id, nivel: "erro", mensagem: `A variável {{${v.caminho}}} usa um passo que não vem antes deste.` });
        }
      }
      break;
    }
    case "condicao":
      conferirRegra(no.regra, "Condição", id, p);
      break;
    case "caminhos":
      if (no.caminhos.length === 0) p.push({ no: id, nivel: "erro", mensagem: "Precisa de pelo menos um caminho." });
      for (const c of no.caminhos) {
        if (!c.nome?.trim()) p.push({ no: id, nivel: "erro", mensagem: "Dê um nome a cada caminho." });
        conferirRegra(c.regra, `Caminho “${c.nome || "sem nome"}”`, id, p);
      }
      break;
    case "espera": {
      const c = no.config;
      if (c.modo === "duracao") {
        if (!(c.quantidade > 0)) p.push({ no: id, nivel: "erro", mensagem: "Espera: informe quanto tempo." });
        if (!(UNIDADES as readonly string[]).includes(c.unidade)) p.push({ no: id, nivel: "erro", mensagem: "Espera: unidade inválida." });
      } else if (c.modo === "ate_data") {
        if (Number.isNaN(Date.parse(c.data ?? ""))) p.push({ no: id, nivel: "erro", mensagem: "Espera: data inválida." });
      } else if (c.modo === "relativa_campo") {
        if (!c.campo) p.push({ no: id, nivel: "erro", mensagem: "Espera: escolha o campo de data." });
        if (!Number.isFinite(c.dias)) p.push({ no: id, nivel: "erro", mensagem: "Espera: informe os dias." });
      } else p.push({ no: id, nivel: "erro", mensagem: "Espera: modo inválido." });
      break;
    }
    case "esperar_evento": {
      const ev = EVENTOS_DE_ESPERA.find((e) => e.tipo === no.evento);
      if (!ev) p.push({ no: id, nivel: "erro", mensagem: "Escolha o que esperar." });
      else if (!ev.objetos.includes(def.objeto)) p.push({ no: id, nivel: "erro", mensagem: "Este evento não acontece neste tipo de registro." });
      if (!(no.prazo?.quantidade > 0)) p.push({ no: id, nivel: "erro", mensagem: "Defina o prazo máximo da espera (sem prazo a execução ficaria parada para sempre)." });
      break;
    }
    case "fim":
      break;
  }
}

export const podePublicar = (p: Pendencia[]) => !p.some((x) => x.nivel === "erro");
