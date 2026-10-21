import "server-only";
import { randomUUID } from "node:crypto";
import type { Node, Edge } from "@xyflow/react";
import { prisma } from "@/lib/db/prisma";
import { qrConectado } from "@/lib/server/canais/qr";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";
import { getBlockDefault } from "@/components/agent-studio/builder/block-defaults";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import { organizarFluxo } from "@/components/agent-studio/builder/auto-layout";
import { SAIDA_INVALIDA, variavelDaCaptura } from "@/lib/capture-validation";
import { normalizarTipoDeTarefa } from "@/lib/tarefas/tipos";

// ---------------------------------------------------------------------------
// Rascunho de fluxo do agente (construtor de blocos) montado pela IA.
//
// O modelo devolve blocos e ligações num formato próximo do canvas; aqui
// tudo é refeito do zero: só entram os blocos que o motor (flow-engine.ts)
// executa e que dá para montar sem segredo (sem credencial, sem URL), só os
// campos conhecidos de cada bloco, só ids de funil/etapa/etiqueta/campo da
// própria org. O grafo sai com um Início, todo bloco alcançável a partir
// dele, sem ligação solta ou duplicada, com ids novos (pode ser acrescentado
// num canvas existente sem colidir) e posições em camadas de cima para baixo.
// ---------------------------------------------------------------------------

export const BLOCOS_PERMITIDOS = [
  "start",
  "message",
  "capture",
  "condition",
  "variable",
  "wait",
  "human",
  "end",
  "crm-deal",
  "crm-stage",
  "crm-task",
  "crm-tag",
  "crm-update",
  "crm-note",
  "crm-lookup",
] as const satisfies readonly IconKey[];
type BlocoPermitido = (typeof BLOCOS_PERMITIDOS)[number];

/** Existem no construtor, mas pedem credencial/URL/servidor: só à mão. */
const BLOCOS_MANUAIS: Record<string, string> = {
  http: "Requisição HTTP",
  webhook: "Webhook",
  email: "Enviar e-mail",
  "ai-agent": "Responder com IA",
  agent: "Enviar para meu fluxo",
  "tool-http": "Ferramenta HTTP",
  "tool-knowledge": "Base de conhecimento",
  "tool-mcp": "Servidor MCP",
  "tool-crm": "Ações de CRM",
};

export const MAX_BLOCOS = 40;
const MAX_OPCOES = 10;
const MAX_LABEL = 60;
const MAX_DETAIL = 1000;
const MAX_CAMPO = 500;
/** Esperar: até 30 dias, guardado em horas (a maior unidade do bloco). */
const MAX_ESPERA_HORAS = 720;


export interface CatalogoFluxo {
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  tags: { id: string; name: string }[];
  camposContato: { key: string; label: string; type: string }[];
  camposNegocio: { key: string; label: string; type: string; pipelineId: string | null }[];
  templates: { id: string; name: string; bodyText: string }[];
  canais: string[];
}

export async function carregarCatalogoFluxo(orgId: string, agentId: string): Promise<CatalogoFluxo> {
  const [pipelines, tags, campos, templates, agente] = await Promise.all([
    prisma.pipeline.findMany({
      where: { orgId },
      select: { id: true, name: true, stages: { select: { id: true, name: true }, orderBy: { position: "asc" } } },
      orderBy: { position: "asc" },
      take: 30,
    }),
    prisma.tag.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.customField.findMany({
      where: { orgId },
      select: { entity: true, key: true, label: true, type: true, pipelineId: true },
      orderBy: [{ position: "asc" }],
      take: 200,
    }),
    prisma.messageTemplate.findMany({
      where: { agentId, NOT: { metaTemplateName: "" } },
      select: { id: true, name: true, bodyText: true },
      take: 50,
    }),
    prisma.agent.findFirst({
      where: { id: agentId, orgId },
      select: {
        widgetEnabled: true,
        metaConnection: { select: { agentId: true } },
        whatsappConnection: { select: { status: true } },
        instagramConnection: { select: { agentId: true } },
        telegramConnection: { select: { agentId: true } },
        messengerConnection: { select: { agentId: true } },
        tiktokConnection: { select: { agentId: true } },
      },
    }),
  ]);

  const canais: string[] = [];
  if (agente?.metaConnection) canais.push("WhatsApp oficial");
  if (agente && (await qrConectado(agentId, agente.whatsappConnection))) canais.push("WhatsApp (QR)");
  if (agente?.instagramConnection) canais.push("Instagram");
  if (agente?.messengerConnection) canais.push("Messenger");
  if (agente?.telegramConnection) canais.push("Telegram");
  if (agente?.tiktokConnection) canais.push("TikTok");
  if (agente?.widgetEnabled) canais.push("Chat do site");

  return {
    pipelines,
    tags,
    camposContato: campos.filter((c) => c.entity === "contact").map(({ key, label, type }) => ({ key, label, type })),
    camposNegocio: campos
      .filter((c) => c.entity === "deal")
      .map(({ key, label, type, pipelineId }) => ({ key, label, type, pipelineId })),
    templates,
    canais,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function str(v: unknown, max = MAX_CAMPO): string {
  return typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "";
}

function acharPorIdOuNome<T extends { id: string; name: string }>(lista: T[], valor: unknown): T | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  return lista.find((x) => x.id === valor) ?? lista.find((x) => semAcento(x.name) === semAcento(valor)) ?? null;
}

const VAR_PROIBIDA = new Set(["__proto__", "constructor", "prototype"]);

/** Nome de variável no formato que o motor interpola: {letras_numeros_e_sublinhado}. */
export function nomeDeVariavel(v: unknown): string {
  const base = semAcento(str(v, 80))
    .replace(/[{}]/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return VAR_PROIBIDA.has(base) ? "" : base;
}

const CONDICAO_COMPARACAO = /^\{(\w+)\}\s*(==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?))$/;
const CONDICAO_SIMPLES = /^\{(\w+)\}$/;

/** Mesmos dois formatos que evaluateCondition (flow-engine.ts) entende. */
export function condicaoValida(expr: string): string | null {
  const m = expr.match(CONDICAO_COMPARACAO) ?? expr.match(CONDICAO_SIMPLES);
  return m ? m[1] : null;
}

const VARIAVEIS_DO_LOOKUP = [
  "crm_empresa",
  "crm_tem_negocio",
  "crm_negocio_id",
  "crm_negocio_etapa",
  "crm_negocio_valor",
  "crm_tarefas_abertas",
  "crm_etiquetas",
];

function tipoDoBloco(b: Record<string, unknown>): string {
  const data = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : null;
  return str(b.bloco ?? b.tipo ?? b.iconKey ?? data?.iconKey ?? b.type, 40);
}

/** Campos do bloco: aceita o formato do esquema (achatado) ou o do canvas (em data). */
function camposDoBloco(b: Record<string, unknown>): Record<string, unknown> {
  const data = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};
  return { ...data, ...b };
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export type NormalizacaoDeFluxo =
  | { ok: true; nodes: Node<FlowNodeData>[]; edges: Edge[]; avisos: string[] }
  | { ok: false; erro: string };

interface BlocoIntermediario {
  rawId: string;
  kind: BlocoPermitido;
  data: FlowNodeData;
  /** id cru da opção → id novo (menus do bloco Perguntar). */
  opcoes: Map<string, string>;
}

export function normalizarFluxo(raw: unknown, cat: CatalogoFluxo): NormalizacaoDeFluxo {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, erro: "O rascunho veio num formato que não dá para usar." };
  }
  const r = raw as Record<string, unknown>;
  const avisos: string[] = [];
  const avisados = new Set<string>(); // rawIds que já ganharam aviso específico

  const brutos = Array.isArray(r.nodes) ? r.nodes : Array.isArray(r.blocos) ? r.blocos : [];
  const ligacoes = Array.isArray(r.edges) ? r.edges : Array.isArray(r.ligacoes) ? r.ligacoes : [];

  if (brutos.length > MAX_BLOCOS) avisos.push(`Um rascunho aceita até ${MAX_BLOCOS} blocos; fiquei com os ${MAX_BLOCOS} primeiros.`);

  const blocos = new Map<string, BlocoIntermediario>();
  let inicio: string | null = null;

  (brutos as unknown[]).slice(0, MAX_BLOCOS).forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const b = camposDoBloco(item as Record<string, unknown>);
    const rawId = str(b.id, 80) || `bloco-${i + 1}`;
    const tipo = tipoDoBloco(item as Record<string, unknown>);
    const rotulo = str(b.label, MAX_LABEL) || tipo;

    if (blocos.has(rawId)) {
      avisos.push(`Havia dois blocos com o mesmo id ("${rawId}"); fiquei com o primeiro.`);
      return;
    }
    if (!(BLOCOS_PERMITIDOS as readonly string[]).includes(tipo)) {
      avisos.push(
        BLOCOS_MANUAIS[tipo]
          ? `O bloco "${BLOCOS_MANUAIS[tipo]}" precisa de configuração sua (credencial ou endereço). Adicione pela paleta depois de aplicar.`
          : `Ignorei um bloco de tipo desconhecido ("${tipo || "sem tipo"}").`
      );
      return;
    }
    const kind = tipo as BlocoPermitido;
    if (kind === "start") {
      if (inicio) {
        avisos.push("O rascunho tinha mais de um Início; fiquei com o primeiro.");
        return;
      }
      inicio = rawId;
    }

    const bloco = montarBloco(kind, rawId, rotulo, b, cat, (msg) => {
      avisos.push(msg);
      avisados.add(rawId);
    });
    blocos.set(rawId, bloco);
  });

  if (!inicio) {
    inicio = "__inicio__";
    blocos.set(inicio, {
      rawId: inicio,
      kind: "start",
      data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false },
      opcoes: new Map(),
    });
  }
  const inicioId: string = inicio;

  // ── Ligações ────────────────────────────────────────────────────────────
  type Lig = { source: string; target: string; handle: string | null };
  const aceitas: Lig[] = [];
  const ocupadas = new Set<string>();
  let soltas = 0;
  let duplicadas = 0;

  for (const item of ligacoes as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const source = str(l.source ?? l.de, 80);
    const target = str(l.target ?? l.para, 80);
    const origem = blocos.get(source);
    const destino = blocos.get(target);
    if (!origem || !destino || source === target || destino.kind === "start" || origem.kind === "end") {
      soltas += 1;
      continue;
    }
    const handle = resolverSaida(origem, l.sourceHandle ?? l.saida, ocupadas);
    if (handle === undefined) {
      soltas += 1;
      continue;
    }
    const chave = `${source}::${handle ?? ""}`;
    if (ocupadas.has(chave)) {
      duplicadas += 1;
      continue;
    }
    ocupadas.add(chave);
    aceitas.push({ source, target, handle });
  }
  if (soltas > 0) avisos.push(`Descartei ${soltas} ligação(ões) que apontavam para blocos inexistentes ou saídas que não existem.`);
  if (duplicadas > 0) avisos.push(`Descartei ${duplicadas} ligação(ões) repetida(s) na mesma saída (o motor só seguiria a primeira).`);

  // Início sem saída: liga no primeiro bloco que ninguém aponta.
  if (!aceitas.some((l) => l.source === inicioId)) {
    const alvo = [...blocos.values()].find(
      (b) => b.kind !== "start" && !aceitas.some((l) => l.target === b.rawId)
    ) ?? [...blocos.values()].find((b) => b.kind !== "start");
    if (alvo) {
      aceitas.push({ source: inicioId, target: alvo.rawId, handle: null });
      ocupadas.add(`${inicioId}::`);
    }
  }

  // ── Alcance a partir do Início ─────────────────────────────────────────
  const alcancados = new Set<string>([inicioId]);
  const fila = [inicioId];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const l of aceitas) {
      if (l.source === atual && !alcancados.has(l.target)) {
        alcancados.add(l.target);
        fila.push(l.target);
      }
    }
  }
  const soltos = [...blocos.values()].filter((b) => !alcancados.has(b.rawId));
  if (soltos.length > 0) {
    avisos.push(
      `Tirei ${soltos.length} bloco(s) que não estavam ligados ao resto do fluxo: ${soltos
        .map((b) => `“${b.data.label}”`)
        .join(", ")}.`
    );
  }
  const finais = [...blocos.values()].filter((b) => alcancados.has(b.rawId));
  if (finais.length <= 1) {
    return { ok: false, erro: "Não consegui montar nenhum bloco ligado ao Início. Tenta descrever o passo a passo da conversa." };
  }
  const ligacoesFinais = aceitas.filter((l) => alcancados.has(l.source) && alcancados.has(l.target));

  // ── Variáveis usadas em Condição que ninguém preenche ──────────────────
  const produzidas = new Set<string>(["nome", "email", "telefone", ...VARIAVEIS_DO_LOOKUP]);
  for (const b of finais) {
    if (b.kind === "capture") produzidas.add(b.data.options?.length ? b.data.variableName ?? "" : variavelDaCaptura(b.data));
    if (b.kind === "variable" || b.kind === "crm-deal") produzidas.add(b.data.variableName ?? "");
    for (const c of cat.camposContato) produzidas.add(c.key);
  }
  for (const b of finais) {
    if (b.kind !== "condition") continue;
    const v = condicaoValida(b.data.conditionExpression ?? "");
    if (v && !produzidas.has(v)) {
      avisos.push(`A condição “${b.data.label}” usa {${v}}, que nenhum bloco antes preenche. Confira o nome da variável.`);
      avisados.add(b.rawId);
    }
  }

  // ── Ids novos + layout ─────────────────────────────────────────────────
  const novoId = new Map<string, string>();
  for (const b of finais) novoId.set(b.rawId, randomUUID());

  let nodes: Node<FlowNodeData>[] = finais.map((b) => ({
    id: novoId.get(b.rawId)!,
    type: "flowNode",
    position: { x: 0, y: 0 },
    data: b.data,
  }));
  const edges: Edge[] = ligacoesFinais.map((l) => {
    const origem = blocos.get(l.source)!;
    const handle = l.handle && origem.opcoes.has(l.handle) ? origem.opcoes.get(l.handle)! : l.handle;
    return {
      id: randomUUID(),
      source: novoId.get(l.source)!,
      target: novoId.get(l.target)!,
      ...(handle ? { sourceHandle: handle } : {}),
    };
  });
  // Mesmo auto-layout do botão "Organizar" do construtor (esquerda→direita).
  nodes = organizarFluxo(nodes, edges);

  // Problemas que o próprio construtor apontaria (campo faltando, bloco que
  // não leva a lugar nenhum), menos os blocos que já ganharam aviso acima.
  const rawPorNovo = new Map([...novoId.entries()].map(([raw, novo]) => [novo, raw]));
  for (const issue of validateFlow(nodes, edges)) {
    if (avisados.has(rawPorNovo.get(issue.nodeId) ?? "")) continue;
    avisos.push(`“${issue.label}”: ${issue.motivo}`);
  }

  return { ok: true, nodes, edges, avisos };
}

/**
 * Saída da ligação conforme o bloco de origem. undefined = saída inexistente.
 * Para Condição e menu, ligação sem saída ganha a primeira saída ainda livre.
 */
function resolverSaida(origem: BlocoIntermediario, bruto: unknown, ocupadas: Set<string>): string | null | undefined {
  const h = typeof bruto === "string" ? bruto.trim() : "";
  const livre = (x: string) => !ocupadas.has(`${origem.rawId}::${x}`);

  if (origem.kind === "condition") {
    const n = semAcento(h);
    if (["true", "sim", "yes", "verdadeiro"].includes(n)) return "true";
    if (["false", "nao", "no", "falso"].includes(n)) return "false";
    if (!h) return livre("true") ? "true" : livre("false") ? "false" : undefined;
    return undefined;
  }

  if (origem.kind === "capture" && origem.opcoes.size > 0) {
    if (h && origem.opcoes.has(h)) return h;
    // O modelo às vezes manda o rótulo da opção no lugar do id.
    const porRotulo = (origem.data.options ?? []).find((o) => semAcento(o.label) === semAcento(h));
    if (porRotulo) return [...origem.opcoes.entries()].find(([, novo]) => novo === porRotulo.id)?.[0];
    if (!h) return [...origem.opcoes.keys()].find(livre);
    return undefined;
  }

  if (origem.kind === "capture" && origem.data.captureField && origem.data.captureField !== "text") {
    return h === SAIDA_INVALIDA ? SAIDA_INVALIDA : null;
  }

  return null;
}

function montarBloco(
  kind: BlocoPermitido,
  rawId: string,
  label: string,
  b: Record<string, unknown>,
  cat: CatalogoFluxo,
  avisar: (msg: string) => void
): BlocoIntermediario {
  const opcoes = new Map<string, string>();
  if (kind === "start") {
    return { rawId, kind, data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false }, opcoes };
  }

  const padrao = getBlockDefault(kind)?.data ?? {};
  const data: FlowNodeData = { ...padrao, iconKey: kind, label };
  const detail = str(b.detail ?? b.texto, MAX_DETAIL);
  if (detail) data.detail = detail;

  switch (kind) {
    case "message": {
      if (b.templateId) {
        const tpl = acharPorIdOuNome(cat.templates, b.templateId);
        if (tpl) data.templateId = tpl.id;
        else avisar(`O modelo de WhatsApp da mensagem “${label}” não é um modelo aprovado deste agente e foi tirado.`);
      }
      break;
    }

    case "capture": {
      const brutas = Array.isArray(b.options) ? (b.options as unknown[]) : [];
      const opts: { id: string; label: string }[] = [];
      brutas.slice(0, MAX_OPCOES).forEach((o, i) => {
        const ob = o && typeof o === "object" ? (o as Record<string, unknown>) : { label: o };
        const rotulo = str(ob.label, 40);
        if (!rotulo) return;
        const id = randomUUID();
        opcoes.set(str(ob.id, 80) || `opcao-${i + 1}`, id);
        opts.push({ id, label: rotulo });
      });
      if (brutas.length > MAX_OPCOES) avisar(`O menu “${label}” tinha mais de ${MAX_OPCOES} opções; fiquei com as ${MAX_OPCOES} primeiras.`);

      if (opts.length > 0) {
        // Menu de botões: a resposta é a opção escolhida, não há validação.
        data.options = opts;
        data.variableName = nomeDeVariavel(b.variableName) || nomeDeVariavel(label) || "opcao";
        delete data.captureField;
        break;
      }

      const campo = str(b.captureField, 20);
      if (campo === "name" || campo === "email" || campo === "phone") {
        data.captureField = campo;
      } else if (campo === "custom") {
        const chave = str(b.captureCustomKey, 80);
        const def = cat.camposContato.find((c) => c.key === chave || semAcento(c.label) === semAcento(chave));
        if (def) {
          data.captureField = "custom";
          data.captureCustomKey = def.key;
        } else {
          avisar(`A pergunta “${label}” apontava para um campo do contato que não existe; virou texto livre.`);
          data.captureField = "text";
          data.variableName = nomeDeVariavel(chave) || nomeDeVariavel(label) || "resposta";
        }
      } else {
        data.captureField = "text";
        data.variableName = nomeDeVariavel(b.variableName) || nomeDeVariavel(label) || "resposta";
      }
      if (data.captureField !== "text") {
        data.captureRequired = b.captureRequired !== false;
        const tent = Math.trunc(Number(b.captureMaxRetries ?? 2));
        data.captureMaxRetries = Number.isFinite(tent) ? Math.min(5, Math.max(0, tent)) : 2;
        const erro = str(b.captureErrorMessage, 300);
        if (erro) data.captureErrorMessage = erro;
      }
      break;
    }

    case "condition": {
      const expr = str(b.conditionExpression, 200);
      data.conditionExpression = expr;
      if (expr && !condicaoValida(expr)) {
        avisar(`A condição “${label}” não está num formato que o motor entende (ex.: {segmento} == "Varejo").`);
      }
      break;
    }

    case "variable": {
      data.variableName = nomeDeVariavel(b.variableName);
      const expr = str(b.variableExpression, 300);
      if (expr) data.variableExpression = expr;
      break;
    }

    case "wait": {
      let qtd = Number(b.waitDuration);
      let unidade = str(b.waitUnit, 20);
      if (unidade === "dias") {
        qtd *= 24;
        unidade = "horas";
      }
      if (unidade !== "segundos" && unidade !== "minutos" && unidade !== "horas") unidade = "minutos";
      if (!Number.isFinite(qtd) || qtd <= 0) {
        avisar(`A espera “${label}” não tinha tempo válido; deixei 1 ${unidade === "horas" ? "hora" : unidade.slice(0, -1)}.`);
        qtd = 1;
      }
      const emHoras = unidade === "horas" ? qtd : unidade === "minutos" ? qtd / 60 : qtd / 3600;
      if (emHoras > MAX_ESPERA_HORAS) {
        avisar(`A espera “${label}” passava de 30 dias; limitei a 30.`);
        qtd = MAX_ESPERA_HORAS;
        unidade = "horas";
      }
      data.waitDuration = Math.round(qtd * 100) / 100;
      data.waitUnit = unidade as FlowNodeData["waitUnit"];
      break;
    }

    case "crm-deal": {
      const destino = resolverEtapa(cat, b.crmPipelineId, b.crmStageId, label, avisar);
      if (destino.pipelineId) data.crmPipelineId = destino.pipelineId;
      if (destino.stageId) data.crmStageId = destino.stageId;
      const nome = str(b.crmDealName, 120);
      if (nome) data.crmDealName = nome;
      const valor = str(b.crmDealAmount, 40);
      data.crmDealAmount = valor;
      const desc = str(b.crmDealDescription);
      if (desc) data.crmDealDescription = desc;
      data.variableName = nomeDeVariavel(b.variableName) || "negocio_id";
      data.crmFieldMap = mapaDeCampos(b.crmFieldMap, camposDoNegocio(cat, destino.pipelineId), label, avisar);
      break;
    }

    case "crm-stage": {
      const destino = resolverEtapa(cat, b.crmPipelineId, b.crmStageId, label, avisar);
      if (destino.pipelineId) data.crmPipelineId = destino.pipelineId;
      if (destino.stageId) data.crmStageId = destino.stageId;
      const motivo = str(b.crmLostReason, 200);
      if (motivo) data.crmLostReason = motivo;
      break;
    }

    case "crm-task": {
      const tipo = str(b.crmTaskType, 20);
      data.crmTaskType = normalizarTipoDeTarefa(tipo) ?? "ligar";
      const txt = str(b.crmTaskText, 300);
      if (txt) data.crmTaskText = txt;
      const prazo = str(b.crmTaskDue, 30);
      if (prazo) data.crmTaskDue = prazo;
      break;
    }

    case "crm-tag": {
      const tag = acharPorIdOuNome(cat.tags, b.crmTagId);
      if (tag) data.crmTagId = tag.id;
      else avisar(`A etiqueta de “${label}” não existe entre as suas. Escolha uma no bloco.`);
      data.crmTagAction = b.crmTagAction === "remove" ? "remove" : "add";
      break;
    }

    case "crm-update": {
      data.crmUpdateTarget = b.crmUpdateTarget === "contact" ? "contact" : "deal";
      data.crmAutoFill = b.crmAutoFill !== false;
      const defs = data.crmUpdateTarget === "contact" ? cat.camposContato : camposDoNegocio(cat, null, true);
      data.crmFieldMap = mapaDeCampos(b.crmFieldMap, defs, label, avisar);
      break;
    }

    case "crm-note": {
      const txt = str(b.crmNoteText, MAX_DETAIL);
      if (txt) data.crmNoteText = txt;
      break;
    }

    default:
      break;
  }

  return { rawId, kind, data, opcoes };
}

function camposDoNegocio(cat: CatalogoFluxo, pipelineId: string | null, todos = false) {
  return cat.camposNegocio.filter((c) => todos || c.pipelineId === null || c.pipelineId === pipelineId);
}

function resolverEtapa(
  cat: CatalogoFluxo,
  pipelineBruto: unknown,
  etapaBruta: unknown,
  label: string,
  avisar: (msg: string) => void
): { pipelineId: string | null; stageId: string | null } {
  let pipeline = acharPorIdOuNome(cat.pipelines, pipelineBruto);
  if (pipelineBruto && !pipeline) avisar(`O funil de “${label}” não existe entre os seus; escolha no bloco.`);

  if (etapaBruta) {
    const candidatos = pipeline ? [pipeline] : cat.pipelines;
    for (const p of candidatos) {
      const etapa = acharPorIdOuNome(p.stages, etapaBruta);
      if (etapa) return { pipelineId: p.id, stageId: etapa.id };
    }
    // Etapa com id de outro funil da org: vale, e o funil acompanha a etapa.
    for (const p of cat.pipelines) {
      const etapa = p.stages.find((s) => s.id === etapaBruta);
      if (etapa) {
        avisar(`A etapa de “${label}” é do funil ${p.name}; ajustei o funil.`);
        return { pipelineId: p.id, stageId: etapa.id };
      }
    }
    avisar(`A etapa de “${label}” não existe nos seus funis; escolha no bloco.`);
    pipeline = pipeline ?? null;
  }
  return { pipelineId: pipeline?.id ?? null, stageId: null };
}

function mapaDeCampos(
  bruto: unknown,
  defs: { key: string; label: string }[],
  label: string,
  avisar: (msg: string) => void
): { key: string; value: string }[] {
  if (!Array.isArray(bruto)) return [];
  const saida: { key: string; value: string }[] = [];
  const ignorados: string[] = [];
  for (const item of bruto.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const chave = str(m.key, 80);
    const def = defs.find((d) => d.key === chave || semAcento(d.label) === semAcento(chave));
    if (!def) {
      if (chave) ignorados.push(chave);
      continue;
    }
    if (saida.some((s) => s.key === def.key)) continue;
    saida.push({ key: def.key, value: str(m.value) });
  }
  if (ignorados.length > 0) avisar(`Em “${label}”, tirei campo(s) que não existem no seu CRM: ${ignorados.join(", ")}.`);
  return saida;
}


// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const ESQUEMA = `{
  "nodes": [
    {
      "id": "texto curto e único, ex.: b1",
      "bloco": "${BLOCOS_PERMITIDOS.join(" | ")}",
      "label": "título curto do bloco (até 60 caracteres)",
      "detail": "texto que o agente diz (message, capture, human, end)",
      "...": "campos do bloco, conforme a lista abaixo"
    }
  ],
  "edges": [
    { "source": "id do bloco de origem", "target": "id do bloco de destino", "sourceHandle": "saída, quando o bloco tem mais de uma (ver abaixo); senão omita" }
  ]
}`;

const CAMPOS_POR_BLOCO = `Campos por bloco:
- start: o ponto de entrada. Exatamente um. Sem campos.
- message: detail (a mensagem). templateId opcional (modelo aprovado do catálogo, para WhatsApp fora da janela de 24h).
- capture (pergunta e espera a resposta): detail (a pergunta).
    Para validar a resposta use captureField: "name" | "email" | "phone" (telefone/WhatsApp com DDD) | "custom" (com captureCustomKey = key de um campo de contato do catálogo).
    Blocos com captureField name/email/phone/custom têm duas saídas: sem sourceHandle (respondeu certo) e sourceHandle "invalido" (desistiu depois das tentativas). captureMaxRetries (0 a 5) e captureErrorMessage opcionais.
    Para texto livre use captureField "text" e variableName (nome da variável, letras e _).
    Para menu de botões use options: [{ "id": "o1", "label": "Varejo" }, ...] e variableName; cada opção é uma saída: sourceHandle = id da opção.
    Respostas ficam em variáveis: name → {nome}, email → {email}, phone → {telefone}, custom → {key do campo}, text/menu → {variableName}.
- condition: conditionExpression no formato {variavel} == "texto" (ou != > < >= <= com número, ou só {variavel}). Duas saídas: sourceHandle "true" (Sim) e "false" (Não).
- variable: variableName e variableExpression (ex.: "{nome} {sobrenome}").
- wait: waitDuration (número > 0) e waitUnit "segundos" | "minutos" | "horas".
- human: detail (o que dizer ao passar para um atendente). Termina o fluxo.
- end: detail opcional (despedida). Termina o fluxo, sem saída.
- crm-deal (cria negócio e vincula o contato): crmPipelineId e crmStageId do catálogo, crmDealName (ex.: "Negócio de {nome}"), crmDealAmount opcional, crmFieldMap opcional [{ "key": key de campo de negócio do catálogo, "value": "{variavel}" }].
- crm-stage (move o negócio aberto): crmStageId do catálogo.
- crm-task: crmTaskType "ligar" | "whatsapp" | "email" | "reuniao" | "visita" | "afazer", crmTaskText, crmTaskDue (ex.: "+1 dia", "3h").
- crm-tag: crmTagId do catálogo e crmTagAction "add" | "remove".
- crm-update: crmUpdateTarget "deal" | "contact", crmFieldMap [{ "key", "value" }].
- crm-note: crmNoteText.
- crm-lookup: carrega {crm_tem_negocio} ("sim"/"nao"), {crm_negocio_etapa}, {crm_etiquetas}, ... para uma condition decidir. Sem campos.`;

export function montarPromptFluxo(cat: CatalogoFluxo): string {
  const catalogo = {
    canais_conectados: cat.canais,
    funis: cat.pipelines.map((p) => ({ id: p.id, nome: p.name, etapas: p.stages.map((s) => ({ id: s.id, nome: s.name })) })),
    etiquetas: cat.tags,
    campos_do_contato: cat.camposContato,
    campos_do_negocio: cat.camposNegocio.map((c) => ({ key: c.key, label: c.label, type: c.type, funil: c.pipelineId ?? "todos" })),
    modelos_aprovados_whatsapp: cat.templates.map((t) => ({ id: t.id, nome: t.name, texto: t.bodyText.slice(0, 200) })),
  };

  return [
    "Você monta fluxos de conversa do construtor de blocos do Eva Studio (um chatbot que atende por WhatsApp, Instagram, site etc.), a partir do pedido de quem usa, em português do Brasil.",
    "Regras:",
    "- Use SOMENTE os tipos de bloco listados e SOMENTE ids do catálogo abaixo. Nunca invente id de funil, etapa, etiqueta ou campo. Se algo pedido não existe no catálogo, deixe o campo vazio e diga na explicação.",
    "- Um único bloco start, ligado ao primeiro passo. Todo bloco precisa ser alcançável a partir do start. Cada saída de um bloco liga em no máximo um destino.",
    "- Todo caminho termina em end ou human. Não há blocos de HTTP, e-mail ou IA livre aqui: se o pedido precisar, mencione na explicação.",
    `- No máximo ${MAX_BLOCOS} blocos. Textos curtos, calorosos e naturais, sem emoji em excesso.`,
    "- Entregue chamando a ferramenta entregar_rascunho, com o JSON no parâmetro rascunho. Não responda em texto.",
    "",
    "Esquema exato do JSON:",
    ESQUEMA,
    "",
    CAMPOS_POR_BLOCO,
    "",
    "Catálogo da organização:",
    JSON.stringify(catalogo),
  ].join("\n");
}

/** Versão enxuta do rascunho atual para o modelo ajustar (sem posição nem campos de tela). */
export function compactarFluxo(atual: unknown): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } | null {
  if (!atual || typeof atual !== "object") return null;
  const a = atual as Record<string, unknown>;
  if (!Array.isArray(a.nodes)) return null;
  const nodes = (a.nodes as unknown[]).slice(0, 60).flatMap((n) => {
    if (!n || typeof n !== "object") return [];
    const no = n as Record<string, unknown>;
    const data = (no.data && typeof no.data === "object" ? no.data : {}) as Record<string, unknown>;
    const { iconKey, kind, hasTarget, hasSource, ...resto } = data;
    void kind;
    void hasTarget;
    void hasSource;
    return [{ id: str(no.id, 80), bloco: iconKey, ...resto }];
  });
  const edges = (Array.isArray(a.edges) ? (a.edges as unknown[]) : []).slice(0, 120).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const ed = e as Record<string, unknown>;
    return [{ source: ed.source, target: ed.target, ...(ed.sourceHandle ? { sourceHandle: ed.sourceHandle } : {}) }];
  });
  return { nodes, edges };
}

export function montarMensagemFluxo(pedido: string, atual: ReturnType<typeof compactarFluxo>): string {
  if (!atual) return `Pedido: ${pedido}`;
  return [
    "Rascunho atual (ajuste este, mantendo o que o pedido não mandou mudar; pode manter os ids):",
    JSON.stringify(atual),
    "",
    `Ajuste pedido: ${pedido}`,
  ].join("\n");
}
