import "server-only";
import { prisma } from "@/lib/db/prisma";
import { qrConectado } from "@/lib/server/canais/qr";
import {
  CANAIS_DE_SEQUENCIA,
  ehCanalDeSequencia,
  ehGatilhoDeSequencia,
  limparPassosDeSequencia,
  type CanalDeSequencia,
  type GatilhoDeSequencia,
} from "@/lib/server/sequences";

// ---------------------------------------------------------------------------
// Rascunho de régua (sequência) montado pela IA.
//
// O modelo propõe; quem decide o que vale é este arquivo. Todo id que vem do
// modelo é conferido contra o catálogo da org (carregado aqui, nunca vindo do
// cliente), e o que não bate é descartado com um aviso legível. Nada é
// gravado: o rascunho volta para a tela, a pessoa revisa e salva pelo editor.
// ---------------------------------------------------------------------------

export const MAX_PASSOS = 10;
/** 90 dias: mais que isso não é follow-up, é outra campanha. */
export const MAX_ESPERA_MIN = 90 * 1440;
export const MAX_TEXTO_PASSO = 1000;
export const MAX_DIAS_PARADO = 365;

const JANELA_MIN = 24 * 60;

export interface CatalogoSequencia {
  tags: { id: string; name: string }[];
  segments: { id: string; name: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  /** Só modelos com nome aprovado na Meta: os únicos que o motor consegue enviar fora da janela. */
  templates: { id: string; name: string; bodyText: string }[];
  canaisConectados: CanalDeSequencia[];
}

export interface PassoDoRascunho {
  order: number;
  delayMinutes: number;
  text: string;
  templateId: string | null;
  applyTagId: string | null;
}

export interface RascunhoSequencia {
  name: string;
  channel: CanalDeSequencia;
  trigger: GatilhoDeSequencia;
  triggerTagId: string | null;
  triggerSegmentId: string | null;
  triggerStageId: string | null;
  triggerStageDays: number;
  stopOnReply: boolean;
  allowReentry: boolean;
  steps: PassoDoRascunho[];
}

export async function carregarCatalogoSequencia(orgId: string, agentId: string): Promise<CatalogoSequencia> {
  const [tags, segments, pipelines, templates, agente] = await Promise.all([
    prisma.tag.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.segment.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }),
    prisma.pipeline.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        stages: { select: { id: true, name: true }, orderBy: { position: "asc" } },
      },
      orderBy: { position: "asc" },
      take: 30,
    }),
    // agentId já foi conferido contra a org pela rota.
    prisma.messageTemplate.findMany({
      where: { agentId, NOT: { metaTemplateName: "" } },
      select: { id: true, name: true, bodyText: true },
      take: 50,
    }),
    prisma.agent.findFirst({
      where: { id: agentId, orgId },
      select: {
        metaConnection: { select: { agentId: true } },
        whatsappConnection: { select: { status: true } },
        instagramConnection: { select: { agentId: true } },
        telegramConnection: { select: { agentId: true } },
      },
    }),
  ]);

  const canaisConectados: CanalDeSequencia[] = [];
  if (agente?.metaConnection) canaisConectados.push("whatsapp_meta");
  if (agente && (await qrConectado(agentId, agente.whatsappConnection))) canaisConectados.push("whatsapp_qr");
  if (agente?.instagramConnection) canaisConectados.push("instagram");
  if (agente?.telegramConnection) canaisConectados.push("telegram");

  return { tags, segments, pipelines, templates, canaisConectados };
}

const NOME_DO_CANAL: Record<CanalDeSequencia, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  instagram: "Instagram",
  telegram: "Telegram",
  email: "E-mail",
};

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Acha pelo id; se o modelo mandou o nome no lugar do id, acha pelo nome. */
function acharPorIdOuNome<T extends { id: string; name: string }>(lista: T[], valor: unknown): T | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  return lista.find((x) => x.id === valor) ?? lista.find((x) => semAcento(x.name) === semAcento(valor)) ?? null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type ValidacaoDeSequencia =
  | { ok: true; sequencia: RascunhoSequencia; avisos: string[] }
  | { ok: false; erro: string };

/**
 * Valida e corrige o rascunho. Corrige o que dá (espera negativa vira zero,
 * texto longo é cortado), descarta o que não pertence à org e só recusa o
 * rascunho inteiro quando não sobra nenhum passo utilizável.
 */
export function validarRascunhoSequencia(raw: unknown, cat: CatalogoSequencia): ValidacaoDeSequencia {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, erro: "O rascunho veio num formato que não dá para usar." };
  }
  const r = raw as Record<string, unknown>;
  const avisos: string[] = [];

  let name = texto(r.name).slice(0, 80);
  if (!name) name = "Régua criada com IA";

  // Canal
  let channel: CanalDeSequencia;
  if (ehCanalDeSequencia(r.channel)) {
    channel = r.channel;
  } else {
    channel = cat.canaisConectados[0] ?? "whatsapp_meta";
    if (r.channel !== undefined) avisos.push(`Canal "${String(r.channel)}" não existe; usei ${NOME_DO_CANAL[channel]}.`);
  }
  if (!cat.canaisConectados.includes(channel)) {
    avisos.push(`O ${NOME_DO_CANAL[channel]} ainda não está conectado neste agente. Conecte antes de ligar a régua.`);
  }

  // Gatilho
  let trigger: GatilhoDeSequencia = ehGatilhoDeSequencia(r.trigger) ? r.trigger : "manual";
  if (r.trigger !== undefined && !ehGatilhoDeSequencia(r.trigger)) {
    avisos.push(`Gatilho "${String(r.trigger)}" não existe; a régua ficou com inscrição manual.`);
  }
  let triggerTagId: string | null = null;
  let triggerSegmentId: string | null = null;
  let triggerStageId: string | null = null;
  let triggerStageDays = 0;

  if (trigger === "tag") {
    const tag = acharPorIdOuNome(cat.tags, r.triggerTagId);
    if (tag) triggerTagId = tag.id;
    else {
      avisos.push("Não achei a etiqueta do gatilho entre as suas. A régua ficou manual: escolha a etiqueta no editor.");
      trigger = "manual";
    }
  } else if (trigger === "segment") {
    const seg = acharPorIdOuNome(cat.segments, r.triggerSegmentId);
    if (seg) triggerSegmentId = seg.id;
    else {
      avisos.push("Não achei o segmento do gatilho entre os seus. A régua ficou manual: escolha o segmento no editor.");
      trigger = "manual";
    }
  } else if (trigger === "stage") {
    const etapas = cat.pipelines.flatMap((p) => p.stages);
    const etapa = acharPorIdOuNome(etapas, r.triggerStageId);
    if (etapa) {
      triggerStageId = etapa.id;
      const dias = Math.trunc(Number(r.triggerStageDays ?? 0) || 0);
      if (dias < 0) avisos.push("Dias parado na etapa não pode ser negativo; ficou 0 (começa assim que entra).");
      if (dias > MAX_DIAS_PARADO) avisos.push(`Dias parado na etapa limitado a ${MAX_DIAS_PARADO}.`);
      triggerStageDays = Math.min(MAX_DIAS_PARADO, Math.max(0, dias));
    } else {
      avisos.push("Não achei a etapa do funil do gatilho entre as suas. A régua ficou manual: escolha a etapa no editor.");
      trigger = "manual";
    }
  }

  // Passos
  const brutos = Array.isArray(r.steps) ? (r.steps as unknown[]) : [];
  if (brutos.length > MAX_PASSOS) avisos.push(`Uma régua aceita até ${MAX_PASSOS} passos aqui; fiquei com os ${MAX_PASSOS} primeiros.`);

  const preparados: { delayMinutes: number; text: string; templateId: string | null; applyTagId: string | null }[] = [];
  brutos.slice(0, MAX_PASSOS).forEach((b, i) => {
    const n = i + 1;
    if (!b || typeof b !== "object") {
      avisos.push(`Passo ${n} veio vazio e foi descartado.`);
      return;
    }
    const s = b as Record<string, unknown>;
    let txt = texto(s.text);
    if (!txt) {
      avisos.push(`Passo ${n} veio sem mensagem e foi descartado.`);
      return;
    }
    if (txt.length > MAX_TEXTO_PASSO) {
      txt = txt.slice(0, MAX_TEXTO_PASSO);
      avisos.push(`A mensagem do passo ${n} era longa demais e foi cortada.`);
    }
    let delay = Math.round(Number(s.delayMinutes));
    if (!Number.isFinite(delay)) {
      delay = 60;
      avisos.push(`Passo ${n} veio sem espera; deixei 1 hora.`);
    } else if (delay < 0) {
      delay = 0;
      avisos.push(`Passo ${n} tinha espera negativa; ficou imediato.`);
    } else if (delay > MAX_ESPERA_MIN) {
      delay = MAX_ESPERA_MIN;
      avisos.push(`Passo ${n} esperava mais de 90 dias; limitei a 90.`);
    }

    let templateId: string | null = null;
    if (s.templateId) {
      const tpl = channel === "whatsapp_meta" ? acharPorIdOuNome(cat.templates, s.templateId) : null;
      if (tpl) templateId = tpl.id;
      else avisos.push(`O modelo de mensagem do passo ${n} não é um modelo aprovado deste agente e foi tirado.`);
    }

    let applyTagId: string | null = null;
    if (s.applyTagId) {
      const tag = acharPorIdOuNome(cat.tags, s.applyTagId);
      if (tag) applyTagId = tag.id;
      else avisos.push(`A etiqueta aplicada no passo ${n} não existe entre as suas e foi tirada.`);
    }

    preparados.push({ delayMinutes: delay, text: txt, templateId, applyTagId });
  });

  const steps = limparPassosDeSequencia(preparados);
  if (steps.length === 0) {
    return { ok: false, erro: "Não consegui montar nenhum passo com mensagem. Tenta descrever o que mandar e quando." };
  }

  // Janela de 24h: no WhatsApp oficial, passo que sai depois de 24h sem
  // resposta precisa de modelo aprovado, senão o motor para a régua.
  if (channel === "whatsapp_meta") {
    let acumulado = 0;
    const semModelo: number[] = [];
    for (const st of steps) {
      acumulado += st.delayMinutes;
      if (acumulado >= JANELA_MIN && !st.templateId) semModelo.push(st.order);
    }
    if (semModelo.length > 0) {
      const lista = semModelo.join(", ");
      avisos.push(
        cat.templates.length > 0
          ? `Passo ${lista} pode cair fora da janela de 24h do WhatsApp: escolha um modelo aprovado para ele no editor.`
          : `Passo ${lista} pode cair fora da janela de 24h do WhatsApp e este agente não tem modelo aprovado. Sem modelo, a régua para nesse passo.`
      );
    }
  }

  return {
    ok: true,
    sequencia: {
      name,
      channel,
      trigger,
      triggerTagId,
      triggerSegmentId,
      triggerStageId,
      triggerStageDays,
      stopOnReply: r.stopOnReply !== false,
      allowReentry: r.allowReentry === true,
      steps,
    },
    avisos,
  };
}

const ESQUEMA = `{
  "name": "string (até 80 caracteres)",
  "channel": "whatsapp_meta | whatsapp_qr | instagram | telegram",
  "trigger": "tag | segment | stage | manual",
  "triggerTagId": "id de etiqueta do catálogo (só se trigger = tag)",
  "triggerSegmentId": "id de segmento do catálogo (só se trigger = segment)",
  "triggerStageId": "id de etapa do catálogo (só se trigger = stage)",
  "triggerStageDays": "inteiro >= 0: há quantos dias o negócio está parado na etapa (0 = assim que entra)",
  "stopOnReply": "boolean (padrão true: sai da régua quando a pessoa responde)",
  "allowReentry": "boolean (padrão false)",
  "steps": [
    {
      "delayMinutes": "inteiro >= 0, espera desde o passo anterior (ou desde a entrada, no passo 1). 1 hora = 60, 1 dia = 1440",
      "text": "mensagem em português; pode usar {nome}",
      "templateId": "id de modelo aprovado do catálogo ou null",
      "applyTagId": "id de etiqueta do catálogo para aplicar quando o passo for entregue, ou null"
    }
  ]
}`;

export function montarPromptSequencia(cat: CatalogoSequencia): string {
  const catalogo = {
    canais: CANAIS_DE_SEQUENCIA.map((c) => ({ id: c, nome: NOME_DO_CANAL[c], conectado: cat.canaisConectados.includes(c) })),
    etiquetas: cat.tags,
    segmentos: cat.segments,
    funis: cat.pipelines.map((p) => ({ id: p.id, nome: p.name, etapas: p.stages.map((s) => ({ id: s.id, nome: s.name })) })),
    modelos_aprovados_whatsapp: cat.templates.map((t) => ({ id: t.id, nome: t.name, texto: t.bodyText.slice(0, 300) })),
  };

  return [
    "Você monta réguas de acompanhamento (sequências) no CRM do Eva Studio, a partir do pedido de quem usa, em português do Brasil.",
    "Uma régua tem um gatilho (quando o contato entra) e passos: cada passo espera um tempo desde o passo anterior e manda uma mensagem.",
    "Regras:",
    "- Use SOMENTE ids que estão no catálogo abaixo. Nunca invente id. Se o pedido cita algo que não existe no catálogo, use trigger \"manual\" ou deixe o campo null e explique na explicação.",
    "- \"Se não responder, manda outro\" é o comportamento normal com stopOnReply = true: quem responde sai da régua.",
    "- delayMinutes é relativo ao passo anterior. Ex.: \"em 2 dias e, se não responder, outro em 5 dias\" = passo 1 com 2880 e passo 2 com 7200 (5 dias depois do passo 1). Se o pedido deixar claro que a conta é desde a entrada, desconte a espera dos passos anteriores.",
    `- No WhatsApp oficial, passo que sai mais de 24h depois da última mensagem da pessoa precisa de templateId de um modelo aprovado. Use um modelo do catálogo quando couber; se não houver, deixe null.`,
    "- Prefira um canal conectado, a menos que o pedido diga outro.",
    `- No máximo ${MAX_PASSOS} passos. Mensagens curtas, calorosas, sem pressão e sem emoji em excesso.`,
    "- Entregue chamando a ferramenta entregar_rascunho, com o JSON no parâmetro rascunho. Não responda em texto.",
    "",
    "Esquema exato do JSON:",
    ESQUEMA,
    "",
    "Catálogo da organização:",
    JSON.stringify(catalogo),
  ].join("\n");
}

export function montarMensagemSequencia(pedido: string, atual: RascunhoSequencia | null): string {
  if (!atual) return `Pedido: ${pedido}`;
  return [
    "Rascunho atual (ajuste este, mantendo o que o pedido não mandou mudar):",
    JSON.stringify(atual),
    "",
    `Ajuste pedido: ${pedido}`,
  ].join("\n");
}
