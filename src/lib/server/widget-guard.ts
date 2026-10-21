import "server-only";
import { createHash } from "node:crypto";
import { checkRateLimit, lerContador } from "@/lib/server/rate-limit";
import { analisarTexto, bloqueia, mensagem, type TipoAmeaca } from "@/lib/server/widget-regras";

// Proteção do widget público contra abuso, robôs e gasto de IA. Roda ANTES da transcrição e da IA.
// Camadas: bloqueio por reincidência, armadilha anti-robô, cotas por IP / visitante / agente,
// repetição da mesma mensagem e classificação do conteúdo (injeção de prompt, spam, lixo, abuso).
// Tudo apoiado no mesmo Postgres do limitador de taxa, então vale para todas as instâncias da Vercel.

function numero(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

// ajustáveis por variável de ambiente, sem mexer no código
const LIM = {
  ipHora: () => numero("WIDGET_IP_HORA", 60),
  ipDia: () => numero("WIDGET_IP_DIA", 200),
  visitanteHora: () => numero("WIDGET_VISITANTE_HORA", 40),
  visitanteDia: () => numero("WIDGET_VISITANTE_DIA", 120),
  agenteDia: () => numero("WIDGET_AGENTE_DIA", 4000),
  audioIpHora: () => numero("WIDGET_AUDIO_IP_HORA", 8),
  audioVisitanteHora: () => numero("WIDGET_AUDIO_VISITANTE_HORA", 6),
  anexoIpHora: () => numero("WIDGET_ANEXO_IP_HORA", 10),
  strikesVisitante: () => numero("WIDGET_STRIKES_VISITANTE", 3), // por hora
  strikesIp: () => numero("WIDGET_STRIKES_IP", 8), // por dia
  maxAudioBytes: () => numero("WIDGET_AUDIO_MAX_BYTES", 1_500_000)
};

export const MAX_TEXTO_WIDGET = 1200;

export type Veredito =
  | { ok: true }
  | { ok: false; status: 200 | 429; texto: string; motivo: string; falso?: boolean };

function hash(t: string): string {
  return createHash("sha1").update(t.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 16);
}

export async function registrarStrike(agentId: string, ip: string, contactId: string, peso: number, motivo: string): Promise<void> {
  for (let i = 0; i < peso; i++) {
    await Promise.all([
      checkRateLimit(`wstrike:v:${agentId}:${contactId}`, 1_000_000, 3600),
      checkRateLimit(`wstrike:ip:${agentId}:${ip}`, 1_000_000, 86400)
    ]);
  }
  console.warn(`[widget-guard] strike ${peso} (${motivo}) agente=${agentId} visitante=${contactId.slice(0, 24)} ip=${ip.slice(0, 40)}`);
}

// Reincidente? Bloqueia por 1 hora (visitante) ou 24 horas (IP) sem tocar em IA.
export async function estaBloqueado(agentId: string, ip: string, contactId: string): Promise<boolean> {
  const [v, i] = await Promise.all([
    lerContador(`wstrike:v:${agentId}:${contactId}`, 3600),
    lerContador(`wstrike:ip:${agentId}:${ip}`, 86400)
  ]);
  return v >= LIM.strikesVisitante() || i >= LIM.strikesIp();
}

interface Entrada {
  agentId: string;
  ip: string;
  contactId: string;
  lang?: string;
  hp?: unknown; // campo isca: pessoas não preenchem
  texto?: string;
  temAudio?: boolean;
  temAnexo?: boolean;
}

// Verificações que valem para qualquer mensagem (antes de decodificar áudio ou arquivo).
export async function verificarEntrada(e: Entrada): Promise<Veredito> {
  if (await estaBloqueado(e.agentId, e.ip, e.contactId)) {
    return { ok: false, status: 429, texto: mensagem("bloqueado", e.lang), motivo: "bloqueado" };
  }

  // armadilha anti-robô: um formulário de verdade nunca preenche o campo escondido
  if (typeof e.hp === "string" && e.hp.trim() !== "") {
    await registrarStrike(e.agentId, e.ip, e.contactId, 3, "honeypot");
    return { ok: false, status: 200, texto: mensagem("recusa", e.lang), motivo: "honeypot", falso: true };
  }

  const [ipH, ipD, vH, vD, agD] = await Promise.all([
    checkRateLimit(`wcota:ip:h:${e.agentId}:${e.ip}`, LIM.ipHora(), 3600),
    checkRateLimit(`wcota:ip:d:${e.agentId}:${e.ip}`, LIM.ipDia(), 86400),
    checkRateLimit(`wcota:v:h:${e.agentId}:${e.contactId}`, LIM.visitanteHora(), 3600),
    checkRateLimit(`wcota:v:d:${e.agentId}:${e.contactId}`, LIM.visitanteDia(), 86400),
    checkRateLimit(`wcota:agente:d:${e.agentId}`, LIM.agenteDia(), 86400)
  ]);
  if (!agD.allowed) {
    console.error(`[widget-guard] teto diário do agente ${e.agentId} atingido (${agD.count})`);
    return { ok: false, status: 429, texto: mensagem("indisponivel", e.lang), motivo: "teto-agente" };
  }
  if (!ipH.allowed || !ipD.allowed || !vH.allowed || !vD.allowed) {
    return { ok: false, status: 429, texto: mensagem("limite", e.lang), motivo: "cota" };
  }

  if (e.temAudio) {
    const [aIp, aV] = await Promise.all([
      checkRateLimit(`wcota:audio:ip:${e.agentId}:${e.ip}`, LIM.audioIpHora(), 3600),
      checkRateLimit(`wcota:audio:v:${e.agentId}:${e.contactId}`, LIM.audioVisitanteHora(), 3600)
    ]);
    if (!aIp.allowed || !aV.allowed) return { ok: false, status: 429, texto: mensagem("limite", e.lang), motivo: "cota-audio" };
  }
  if (e.temAnexo) {
    const a = await checkRateLimit(`wcota:anexo:ip:${e.agentId}:${e.ip}`, LIM.anexoIpHora(), 3600);
    if (!a.allowed) return { ok: false, status: 429, texto: mensagem("limite", e.lang), motivo: "cota-anexo" };
  }
  return { ok: true };
}

export function audioGrandeDemais(bytes: number): boolean {
  return bytes > LIM.maxAudioBytes();
}

// Conteúdo: injeção de prompt, spam, lixo, abuso e repetição da mesma frase. Vale para o texto digitado e
// para a transcrição de áudio. Quem insiste acumula strikes e é bloqueado sem gastar IA.
export async function verificarConteudo(e: { agentId: string; ip: string; contactId: string; lang?: string; texto: string }): Promise<Veredito> {
  const texto = e.texto.trim();
  if (!texto) return { ok: true };

  const analise = analisarTexto(texto);
  if (bloqueia(analise)) {
    const peso = (analise.tipo as TipoAmeaca | null) === "injecao" ? 2 : 1;
    await registrarStrike(e.agentId, e.ip, e.contactId, peso, `${analise.tipo}:${analise.sinais.join(",")}`);
    return { ok: false, status: 200, texto: mensagem("recusa", e.lang), motivo: analise.tipo || "conteudo" };
  }

  // a mesma mensagem mais de duas vezes em 5 minutos: insistência
  if (texto.length >= 4) {
    const rep = await checkRateLimit(`wdup:${e.agentId}:${e.contactId}:${hash(texto)}`, 2, 300);
    if (!rep.allowed) {
      await registrarStrike(e.agentId, e.ip, e.contactId, 1, "repeticao");
      return { ok: false, status: 200, texto: mensagem("repetida", e.lang), motivo: "repeticao" };
    }
  }
  return { ok: true };
}
