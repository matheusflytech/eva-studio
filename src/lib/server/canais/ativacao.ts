import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import type { TipoDeCanal } from "@/lib/canais";

// ---------------------------------------------------------------------------
// Ativação de um canal do contrato num agente.
//
// A conexão é do contrato (eva_studio_canais). Para a entrada de mensagens e
// os envios continuarem iguais, o agente que atende recebe uma CÓPIA das
// credenciais na tabela dele de sempre (MetaConnection, InstagramConnection,
// MessengerConnection, TelegramConnection, TikTokConnection). Ativar = gravar
// essa cópia; desativar = apagar a cópia (o canal continua conectado).
//
// `segredos` do canal guarda, cifrado, exatamente os campos da linha da
// ativação como estão no banco (tokens já cifrados continuam cifrados). A
// cópia do agente, quando existe, é a fonte mais nova (token renovado do
// TikTok, webhook do Telegram) e a cada troca atualiza os segredos do canal.
// Canal migrado pelo SQL vem sem `segredos` e usa a cópia como fonte.
//
// WhatsApp por QR não tem cópia: a sessão é do canal e o worker acha o agente
// pelo canal (eva_studio_canais_whatsapp_qr).
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;
export type DadosDaAtivacao = Record<string, unknown>;

/** Campos da linha da ativação que não são credencial/identidade do canal. */
const FORA = new Set(["agentId", "createdAt", "updatedAt"]);

function semCamposDoAgente(linha: Record<string, unknown> | null): DadosDaAtivacao | null {
  if (!linha) return null;
  return Object.fromEntries(Object.entries(linha).filter(([k]) => !FORA.has(k)));
}

export async function lerAtivacao(tx: Tx, tipo: TipoDeCanal, agentId: string): Promise<DadosDaAtivacao | null> {
  const onde = { where: { agentId } };
  switch (tipo) {
    case "whatsapp_meta":
      return semCamposDoAgente(await tx.metaConnection.findUnique(onde));
    case "instagram":
      return semCamposDoAgente(await tx.instagramConnection.findUnique(onde));
    case "messenger":
      return semCamposDoAgente(await tx.messengerConnection.findUnique(onde));
    case "telegram":
      return semCamposDoAgente(await tx.telegramConnection.findUnique(onde));
    case "tiktok":
      return semCamposDoAgente(await tx.tikTokConnection.findUnique(onde));
    case "whatsapp_qr":
      return {};
  }
}

export async function apagarAtivacao(tx: Tx, tipo: TipoDeCanal, agentId: string): Promise<void> {
  const onde = { where: { agentId } };
  switch (tipo) {
    case "whatsapp_meta":
      await tx.metaConnection.deleteMany(onde);
      return;
    case "instagram":
      await tx.instagramConnection.deleteMany(onde);
      return;
    case "messenger":
      await tx.messengerConnection.deleteMany(onde);
      return;
    case "telegram":
      await tx.telegramConnection.deleteMany(onde);
      return;
    case "tiktok":
      await tx.tikTokConnection.deleteMany(onde);
      return;
    case "whatsapp_qr":
      return;
  }
}

export async function gravarAtivacao(tx: Tx, tipo: TipoDeCanal, agentId: string, dados: DadosDaAtivacao): Promise<void> {
  // Os campos vêm de uma linha da própria tabela (ou da conexão do contrato,
  // montada com os mesmos nomes): o cast só tira o tipo do JSON.
  const data = { ...dados, agentId } as never;
  switch (tipo) {
    case "whatsapp_meta":
      await tx.metaConnection.create({ data });
      return;
    case "instagram":
      await tx.instagramConnection.create({ data });
      return;
    case "messenger":
      await tx.messengerConnection.create({ data });
      return;
    case "telegram":
      await tx.telegramConnection.create({ data });
      return;
    case "tiktok":
      await tx.tikTokConnection.create({ data });
      return;
    case "whatsapp_qr":
      return;
  }
}

export const cifrarSegredos = (dados: DadosDaAtivacao) => encryptSecret(JSON.stringify(dados));

export function decifrarSegredos(segredos: string | null | undefined): DadosDaAtivacao | null {
  if (!segredos) return null;
  try {
    const v = JSON.parse(decryptSecret(segredos));
    return v && typeof v === "object" ? (v as DadosDaAtivacao) : null;
  } catch {
    return null;
  }
}

export type ResultadoDaAtivacao =
  | { ok: true; tipo: TipoDeCanal; dados: DadosDaAtivacao; saiuDe: string | null }
  | { ok: false; status: number; error: string };

/**
 * O agente passa a atender pelo canal. Se o canal estava com outro agente,
 * sai de lá; se o agente já atendia por outro canal do mesmo tipo, aquele
 * fica sem agente (continua conectado no contrato).
 */
export async function ativarCanal(orgId: string, canalId: string, agentId: string): Promise<ResultadoDaAtivacao> {
  return prisma.$transaction(async (tx) => {
    const canal = await tx.canal.findFirst({ where: { id: canalId, orgId } });
    if (!canal) return { ok: false as const, status: 404, error: "Canal não encontrado neste contrato." };
    const agente = await tx.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
    if (!agente) return { ok: false as const, status: 404, error: "Agente não encontrado neste contrato." };
    const tipo = canal.tipo as TipoDeCanal;

    if (canal.agentId === agentId) return { ok: true as const, tipo, dados: {}, saiuDe: null };

    // A cópia do agente é a mais nova (o TikTok renova o token nela); sem
    // agente, valem os segredos guardados no canal.
    const dados = (canal.agentId ? await lerAtivacao(tx, tipo, canal.agentId) : null) ?? decifrarSegredos(canal.segredos);
    if (!dados) {
      return { ok: false as const, status: 409, error: "As credenciais deste canal não estão mais disponíveis. Desconecte e conecte de novo." };
    }

    // O agente já atendia por outro canal deste tipo: esse fica sem agente.
    const anterior = await tx.canal.findFirst({ where: { orgId, agentId, tipo, NOT: { id: canalId } } });
    if (anterior) {
      const dadosAnterior = (await lerAtivacao(tx, tipo, agentId)) ?? decifrarSegredos(anterior.segredos);
      await tx.canal.update({
        where: { id: anterior.id },
        data: { agentId: null, ...(dadosAnterior ? { segredos: cifrarSegredos(dadosAnterior) } : {}) },
      });
    }

    const saiuDe = canal.agentId;
    if (saiuDe) await apagarAtivacao(tx, tipo, saiuDe);
    await apagarAtivacao(tx, tipo, agentId);
    await gravarAtivacao(tx, tipo, agentId, dados);
    await tx.canal.update({
      where: { id: canalId },
      data: { agentId, segredos: cifrarSegredos(dados) },
    });
    return { ok: true as const, tipo, dados, saiuDe };
  });
}

/** O canal deixa de ter agente (continua conectado no contrato). */
export async function desativarCanal(orgId: string, canalId: string): Promise<ResultadoDaAtivacao> {
  return prisma.$transaction(async (tx) => {
    const canal = await tx.canal.findFirst({ where: { id: canalId, orgId } });
    if (!canal) return { ok: false as const, status: 404, error: "Canal não encontrado neste contrato." };
    const tipo = canal.tipo as TipoDeCanal;
    if (!canal.agentId) return { ok: true as const, tipo, dados: {}, saiuDe: null };

    const saiuDe = canal.agentId;
    const dados = (await lerAtivacao(tx, tipo, saiuDe)) ?? decifrarSegredos(canal.segredos);
    await apagarAtivacao(tx, tipo, saiuDe);
    await tx.canal.update({
      where: { id: canalId },
      data: { agentId: null, ...(dados ? { segredos: cifrarSegredos(dados) } : {}) },
    });
    return { ok: true as const, tipo, dados: dados ?? {}, saiuDe };
  });
}
