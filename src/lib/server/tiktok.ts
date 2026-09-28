import "server-only";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/server/crypto";

// ---------------------------------------------------------------------------
// TikTok Business Messaging (§22 do CHATBOT_ENGINE.md)
//
// Diferente da Meta em três pontos que moldam este arquivo:
//
//   1. Token curto. O access token vale ~24h e o refresh ~30 dias, então
//      renovar faz parte do funcionamento normal, não é tratamento de erro.
//      `getValidAccessToken` renova sozinho antes de cada uso.
//   2. Autenticação por header próprio: `Access-Token`, não `Authorization`.
//   3. Restrição de região: a API não atende conta registrada no Espaço
//      Econômico Europeu, Suíça e Reino Unido, e o app precisa de aprovação
//      no portal de desenvolvedor.
//
// Aviso honesto sobre os caminhos: a base (business-api.tiktok.com/open_api/
// v1.3) e o modelo de autenticação estão confirmados na documentação pública.
// Os caminhos exatos dos endpoints de mensagem só aparecem no portal, que
// exige login de desenvolvedor aprovado — por isso eles são configuráveis por
// variável de ambiente, e trocar um caminho não exige mexer no código.
// ---------------------------------------------------------------------------

const BASE = process.env.TIKTOK_API_BASE ?? "https://business-api.tiktok.com/open_api/v1.3";

const PATHS = {
  sendMessage: process.env.TIKTOK_SEND_PATH ?? "/business/message/send/",
  refreshToken: process.env.TIKTOK_REFRESH_PATH ?? "/oauth2/access_token/",
};

/** Renova o token quando falta menos de 1h — margem pra não expirar no meio do uso. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

export async function getValidAccessToken(agentId: string): Promise<string | null> {
  const conn = await prisma.tikTokConnection.findUnique({ where: { agentId } });
  if (!conn) return null;

  const needsRefresh =
    !!conn.expiresAt && conn.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS && !!conn.refreshToken;

  if (!needsRefresh) return decryptSecret(conn.accessToken);

  try {
    const res = await fetch(`${BASE}${PATHS.refreshToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: process.env.TIKTOK_APP_ID,
        secret: process.env.TIKTOK_APP_SECRET,
        grant_type: "refresh_token",
        refresh_token: decryptSecret(conn.refreshToken),
      }),
    });
    const data = await res.json();
    const payload = data?.data;
    if (!res.ok || !payload?.access_token) {
      await prisma.tikTokConnection.update({
        where: { agentId },
        data: { lastError: `Falha ao renovar token: ${data?.message ?? res.status}` },
      });
      // Devolve o token antigo: pode ser que ainda funcione, e falhar aqui
      // silenciosamente é pior que tentar.
      return decryptSecret(conn.accessToken);
    }

    await prisma.tikTokConnection.update({
      where: { agentId },
      data: {
        accessToken: encryptSecret(payload.access_token),
        refreshToken: payload.refresh_token ? encryptSecret(payload.refresh_token) : conn.refreshToken,
        expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
        lastError: null,
      },
    });
    return payload.access_token;
  } catch (error) {
    console.error("[tiktok] erro ao renovar token", error);
    return decryptSecret(conn.accessToken);
  }
}

export async function sendTikTokText(
  agentId: string,
  conversationId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const conn = await prisma.tikTokConnection.findUnique({ where: { agentId } });
  if (!conn) return { ok: false, error: "Agente sem conta TikTok conectada." };

  const token = await getValidAccessToken(agentId);
  if (!token) return { ok: false, error: "Sem token válido do TikTok." };

  try {
    const res = await fetch(`${BASE}${PATHS.sendMessage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify({
        business_id: conn.businessId,
        conversation_id: conversationId,
        message: { type: "text", text },
      }),
    });
    const data = await res.json().catch(() => null);
    // A Business API responde 200 com code != 0 quando dá erro de negócio —
    // checar só o status HTTP deixaria falha passar como sucesso.
    if (!res.ok || (data && data.code !== 0 && data.code !== undefined)) {
      return { ok: false, error: `TikTok ${data?.code ?? res.status}: ${data?.message ?? "erro"}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "falha de rede" };
  }
}
