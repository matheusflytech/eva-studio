import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { assinarEventosInstagram } from "@/lib/server/instagram-subscribe";
import type { TipoDeCanal } from "@/lib/canais";
import { cifrarSegredos, decifrarSegredos, desativarCanal, gravarAtivacao, apagarAtivacao, type DadosDaAtivacao } from "./ativacao";
import { tokenDoWebhookTikTok } from "@/lib/server/tiktok-token";

// ---------------------------------------------------------------------------
// Conectar e desconectar canais no CONTRATO (Configurações → Canais).
//
// Cada função valida com o provedor do mesmo jeito que a conexão por agente
// sempre fez e grava um canal sem agente, com as credenciais em `segredos`
// no formato da tabela de ativação. O agente escolhe o canal depois (ver
// ativacao.ts). Reconectar o mesmo número/conta atualiza o canal que já
// existe (e a cópia do agente que atende, se houver).
// ---------------------------------------------------------------------------

export type ResultadoDeConexao =
  | { ok: true; canalId: string; aviso?: string; webhookUrl?: string }
  | { ok: false; status: number; error: string };

const GRAPH = "https://graph.facebook.com/v21.0";

/** No lugar do agentId no state do OAuth do Instagram: conexão do contrato, sem agente. */
export const MODO_CONTRATO = "@contrato";

function baseDoApp(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  );
}

export const webhookDoTelegramPorCanal = (canalId: string) => `${baseDoApp()}/api/webhooks/telegram/canal/${canalId}`;

export function webhookDoTikTokPorCanal(canalId: string): string {
  // O TikTok não assina o corpo: a URL carrega um token deste canal (nunca o segredo interno).
  const token = tokenDoWebhookTikTok(`canal:${canalId}`);
  return `${baseDoApp()}/api/webhooks/tiktok/canal/${canalId}${token ? `?token=${token}` : ""}`;
}

/**
 * Grava o canal. Mesmo número/conta já conectado neste contrato = atualiza;
 * conectado em OUTRO contrato = recusa (a entrada de mensagens não saberia
 * para qual dos dois mandar).
 */
export async function salvarCanal(
  orgId: string,
  c: { tipo: TipoDeCanal; rotulo: string; externalId: string | null; dados: DadosDaAtivacao; status?: string; detalhe?: string | null }
): Promise<ResultadoDeConexao> {
  const existente = c.externalId ? await prisma.canal.findFirst({ where: { tipo: c.tipo, externalId: c.externalId } }) : null;
  if (existente && existente.orgId !== orgId) {
    return { ok: false, status: 409, error: "Este número/conta já está conectado em outro contrato." };
  }
  const dados = { rotulo: c.rotulo, segredos: cifrarSegredos(c.dados), status: c.status ?? "conectado", detalhe: c.detalhe ?? null };
  if (existente) {
    await prisma.canal.update({ where: { id: existente.id }, data: dados });
    // Reconectou um canal que um agente usa: a cópia dele recebe o token novo.
    if (existente.agentId) {
      await prisma.$transaction(async (tx) => {
        await apagarAtivacao(tx, c.tipo, existente.agentId!);
        await gravarAtivacao(tx, c.tipo, existente.agentId!, c.dados);
      });
    }
    return { ok: true, canalId: existente.id };
  }
  const novo = await prisma.canal.create({ data: { orgId, tipo: c.tipo, externalId: c.externalId, ...dados } });
  return { ok: true, canalId: novo.id };
}

// --- Telegram ----------------------------------------------------------------

export async function conectarTelegram(orgId: string, botToken: string): Promise<ResultadoDeConexao> {
  const token = botToken.trim();
  if (!token) return { ok: false, status: 400, error: "Cole o token do bot (@BotFather)." };
  if (!webhookDoTelegramPorCanal("x").startsWith("https://")) {
    return { ok: false, status: 400, error: "O Telegram só aceita webhook em HTTPS. Configure NEXT_PUBLIC_APP_URL com o domínio público do app." };
  }

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()).catch(() => null);
  if (!me?.ok) return { ok: false, status: 400, error: "Token inválido — o Telegram não reconheceu esse bot." };
  const botUsername = String(me.result?.username ?? "");

  const salvo = await salvarCanal(orgId, {
    tipo: "telegram",
    rotulo: botUsername ? `@${botUsername}` : "Bot do Telegram",
    externalId: botUsername || null,
    dados: { botToken: encryptSecret(token), botUsername, webhookSet: false, lastError: null },
    status: "pendente",
  });
  if (!salvo.ok) return salvo;

  // Webhook por canal: trocar de agente não exige registrar de novo.
  const secret = process.env.INTERNAL_API_SECRET ?? "";
  const hook = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookDoTelegramPorCanal(salvo.canalId), secret_token: secret || undefined, allowed_updates: ["message", "callback_query"] }),
  })
    .then((r) => r.json())
    .catch(() => null);
  const ok = !!hook?.ok;
  const erro = ok ? null : hook?.description ?? "Falha ao registrar webhook.";
  await salvarCanal(orgId, {
    tipo: "telegram",
    rotulo: botUsername ? `@${botUsername}` : "Bot do Telegram",
    externalId: botUsername || null,
    dados: { botToken: encryptSecret(token), botUsername, webhookSet: ok, lastError: erro },
    status: ok ? "conectado" : "atencao",
    detalhe: erro,
  });
  return ok ? salvo : { ...salvo, aviso: `Bot salvo, mas o Telegram recusou o webhook: ${erro}` };
}

// --- Messenger ---------------------------------------------------------------

export async function conectarMessenger(orgId: string, pageId: string, pageAccessToken: string): Promise<ResultadoDeConexao> {
  const id = pageId.trim();
  const token = pageAccessToken.trim();
  if (!id || !token) return { ok: false, status: 400, error: "Informe o ID da Página e o token de acesso dela." };

  const meRes = await fetch(`${GRAPH}/${id}?fields=name&access_token=${token}`);
  const me = await meRes.json().catch(() => null);
  if (!meRes.ok || !me?.name) return { ok: false, status: 400, error: me?.error?.message ?? "A Meta não reconheceu esse par de ID e token." };

  // Sem assinar os campos de mensagem a conexão parece certa, mas nada chega.
  const sub = await fetch(`${GRAPH}/${id}/subscribed_apps?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: "messages,messaging_postbacks,messaging_optins" }),
  })
    .then((r) => r.json())
    .catch(() => null);

  const salvo = await salvarCanal(orgId, {
    tipo: "messenger",
    rotulo: me.name,
    externalId: id,
    dados: { pageId: id, pageAccessToken: encryptSecret(token), pageName: me.name },
  });
  if (!salvo.ok || sub?.success) return salvo;
  return { ...salvo, aviso: sub?.error?.message ?? "Página salva, mas não foi possível assinar o webhook." };
}

// --- TikTok ------------------------------------------------------------------

export async function conectarTikTok(
  orgId: string,
  b: { businessId: string; accessToken: string; refreshToken?: string; expiresIn?: number; displayName?: string }
): Promise<ResultadoDeConexao> {
  const businessId = b.businessId.trim();
  const accessToken = b.accessToken.trim();
  if (!businessId || !accessToken) return { ok: false, status: 400, error: "Informe o Business ID e o access token." };
  const refresh = (b.refreshToken ?? "").trim();
  const segundos = Number(b.expiresIn ?? 0);

  const salvo = await salvarCanal(orgId, {
    tipo: "tiktok",
    rotulo: b.displayName?.trim() || "Conta do TikTok",
    externalId: businessId,
    dados: {
      businessId,
      accessToken: encryptSecret(accessToken),
      refreshToken: refresh ? encryptSecret(refresh) : "",
      // ISO: o Prisma aceita texto ISO num campo de data ao gravar a ativação.
      expiresAt: segundos > 0 ? new Date(Date.now() + segundos * 1000).toISOString() : null,
      displayName: b.displayName?.trim() ?? "",
      lastError: null,
    },
  });
  return salvo.ok ? { ...salvo, webhookUrl: webhookDoTikTokPorCanal(salvo.canalId) } : salvo;
}

// --- WhatsApp oficial (Embedded Signup) --------------------------------------

export async function conectarWhatsAppOficial(
  orgId: string,
  b: { code: string; wabaId: string; phoneNumberId: string }
): Promise<ResultadoDeConexao> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, status: 503, error: "App Meta ainda não configurado neste ambiente." };
  if (!b.code || !b.wabaId || !b.phoneNumberId) return { ok: false, status: 400, error: "code, wabaId e phoneNumberId são obrigatórios." };

  try {
    const tokenData = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${b.code}`).then((r) => r.json());
    const accessToken = tokenData?.access_token;
    if (!accessToken) return { ok: false, status: 502, error: "Meta não devolveu um token válido pra esse code." };

    // Assina o app para receber os webhooks dessa WABA (exigido pelo Embedded Signup).
    await fetch(`${GRAPH}/${b.wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });

    let displayPhone: string | null = null;
    try {
      const phone = await fetch(`${GRAPH}/${b.phoneNumberId}?fields=display_phone_number`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.json());
      displayPhone = phone?.display_phone_number ?? null;
    } catch {
      // Não crítico: só não mostra o número na tela.
    }

    return await salvarCanal(orgId, {
      tipo: "whatsapp_meta",
      rotulo: displayPhone ?? b.phoneNumberId,
      externalId: b.phoneNumberId,
      dados: { phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, accessToken: encryptSecret(accessToken), displayPhone },
    });
  } catch {
    return { ok: false, status: 502, error: "Falha ao concluir a conexão com a Meta." };
  }
}

// --- Instagram (depois do OAuth) ---------------------------------------------

export async function conectarInstagram(
  orgId: string,
  b: { igBusinessId: string; accessToken: string; username: string | null }
): Promise<ResultadoDeConexao & { assinou?: boolean }> {
  const salvo = await salvarCanal(orgId, {
    tipo: "instagram",
    rotulo: b.username ? `@${b.username}` : b.igBusinessId,
    externalId: b.igBusinessId,
    dados: { igBusinessId: b.igBusinessId, pageAccessToken: encryptSecret(b.accessToken), username: b.username },
  });
  if (!salvo.ok) return salvo;
  const assinatura = await assinarEventosInstagram(b.accessToken);
  return { ...salvo, assinou: assinatura.ok };
}

// --- WhatsApp por QR ---------------------------------------------------------

/** Cria o canal e pede a sessão ao worker (status "requesting"). */
export async function conectarWhatsAppQr(orgId: string): Promise<ResultadoDeConexao> {
  const canal = await prisma.canal.create({
    data: { orgId, tipo: "whatsapp_qr", rotulo: "Número ainda não lido", externalId: null, status: "pendente", segredos: cifrarSegredos({}) },
  });
  await prisma.canalWhatsAppQr.create({ data: { canalId: canal.id, status: "requesting" } });
  return { ok: true, canalId: canal.id };
}

// --- Desconectar -------------------------------------------------------------

export async function desconectarCanal(orgId: string, canalId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const canal = await prisma.canal.findFirst({ where: { id: canalId, orgId } });
  if (!canal) return { ok: false, status: 404, error: "Canal não encontrado neste contrato." };

  const saida = await desativarCanal(orgId, canalId);
  if (!saida.ok) return saida;
  const dados = Object.keys(saida.dados).length ? saida.dados : decifrarSegredos(canal.segredos) ?? {};

  if (canal.tipo === "telegram" && typeof dados.botToken === "string") {
    // Tira o webhook, senão o bot fica mandando update para uma URL muda.
    await fetch(`https://api.telegram.org/bot${decryptSecret(dados.botToken)}/deleteWebhook`).catch(() => {});
  }
  if (canal.tipo === "whatsapp_qr") {
    // O worker vê "logging_out", encerra a sessão e apaga as credenciais.
    await prisma.canalWhatsAppQr.updateMany({ where: { canalId }, data: { status: "logging_out" } });
  }
  await prisma.canal.delete({ where: { id: canalId } });
  return { ok: true };
}
