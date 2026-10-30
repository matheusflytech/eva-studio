import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { FACEBOOK_GRAPH, GRAPH_VERSION } from "@/lib/server/meta-graph";
import { INSIGHT_FIELDS, parseInsightRow, syncWindow } from "@/lib/marketing/meta-ads";

// ---------------------------------------------------------------------------
// Meta Ads (M2): conectar a conta de anúncios e ler o gasto por dia/anúncio.
// Único lugar que decifra o token da conexão; ele nunca volta para a tela nem
// para log. Só leitura: a Eva não cria nem altera nada na conta de anúncios.
//   1. /api/marketing/meta/start manda para o Facebook Login for Business.
//   2. O callback chama connectFromCode: token (longo, se for de usuário),
//      quem conectou e as contas de anúncio (desligadas até a pessoa ligar).
//   3. O relógio chama syncDueMetaAccounts a cada rodada; cada conta ligada
//      é lida a cada 6 h (ou na hora, por "Sincronizar agora").
// Spec: docs/superpowers/specs/2026-10-29-marketing-m2-meta-ads-design.md
// ---------------------------------------------------------------------------

export const COOKIE_META_ADS = "meta_ads_oauth";
const SYNC_EVERY_MS = 6 * 3600_000;
const LOCK_MS = 5 * 60_000;
const MAX_PAGES = 50;

// Endereços trocáveis só para o teste local com uma Meta falsa.
const graphBase = () => process.env.META_GRAPH_URL ?? FACEBOOK_GRAPH;
const dialogBase = () => process.env.META_DIALOG_URL ?? `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/** App que pede ads_read: o próprio de anúncios, senão o app da Meta que o contrato já usa. */
export function metaAdsApp(): { appId: string; appSecret: string; configId: string | null } | null {
  const appId = process.env.META_ADS_APP_ID ?? process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_ADS_APP_SECRET ?? process.env.META_APP_SECRET;
  return appId && appSecret ? { appId, appSecret, configId: process.env.META_ADS_CONFIG_ID ?? null } : null;
}

export const newState = () => crypto.randomBytes(24).toString("hex");

/** Com config_id, a configuração do painel decide token e permissões (Login for Business). */
export function loginUrl(app: { appId: string; configId: string | null }, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, state, response_type: "code" });
  if (app.configId) {
    q.set("config_id", app.configId);
    q.set("override_default_response_type", "true");
  } else {
    q.set("scope", "ads_read,business_management");
  }
  return `${dialogBase()}?${q}`;
}

export class MetaError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da Graph */
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    // Mensagem da Meta sem o token (ele vai na URL, nunca no texto do erro).
    throw new MetaError(String(data?.error?.message ?? `Meta respondeu ${res.status}`).slice(0, 300), Number(data?.error?.code) || undefined);
  }
  return data;
}

const graphGet = (path: string, params: Record<string, string>) => getJson(`${graphBase()}/${path}?${new URLSearchParams(params)}`);

/** Segue paging.next até o fim (ou o teto de páginas). */
async function allPages(first: any): Promise<any[]> {
  const out: any[] = [...(first?.data ?? [])];
  let next: string | undefined = first?.paging?.next;
  for (let i = 1; next && i < MAX_PAGES; i++) {
    const page = await getJson(next);
    out.push(...(page?.data ?? []));
    next = page?.paging?.next;
  }
  return out;
}

/** Troca o code, guarda a conexão e as contas de anúncio. Devolve quantas contas vieram. */
export async function connectFromCode(orgId: string, userId: string, code: string, redirectUri: string): Promise<{ accounts: number } | { error: string }> {
  const app = metaAdsApp();
  if (!app) return { error: "sem_app" };
  try {
    const short = await graphGet("oauth/access_token", { client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code });
    let token = String(short.access_token ?? "");
    if (!token) return { error: "sem_token" };

    const debug = (await graphGet("debug_token", { input_token: token, access_token: `${app.appId}|${app.appSecret}` })).data ?? {};
    const systemUser = debug.type === "SYSTEM_USER";
    let expiresAt: Date | null = null;
    if (!systemUser) {
      // Token de usuário: troca pelo de 60 dias (o curto dura horas).
      const long = await graphGet("oauth/access_token", { grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: token });
      token = String(long.access_token ?? token);
      const secs = Number(long.expires_in);
      expiresAt = Number.isFinite(secs) && secs > 0 ? new Date(Date.now() + secs * 1000) : null;
    }

    const me = await graphGet("me", { fields: "id,name", access_token: token });
    const accounts = await allPages(
      await graphGet("me/adaccounts", { fields: "id,name,currency,timezone_name,account_status", limit: "200", access_token: token })
    );

    const data = {
      status: "active",
      externalLabel: String(me.name ?? "").slice(0, 200),
      tokenType: systemUser ? "system_user" : "user",
      secrets: encryptSecret(token),
      expiresAt,
      lastError: null,
      connectedById: userId,
    };
    const conn = await prisma.marketingConnection.upsert({
      where: { orgId_provider_externalUserId: { orgId, provider: "meta", externalUserId: String(me.id) } },
      create: { orgId, provider: "meta", externalUserId: String(me.id), ...data },
      update: data,
    });
    for (const a of accounts) {
      if (!a?.id) continue;
      const fields = { connectionId: conn.id, name: String(a.name ?? a.id).slice(0, 200), currency: String(a.currency ?? "BRL"), timezone: String(a.timezone_name ?? "America/Sao_Paulo") };
      await prisma.marketingAccount.upsert({
        where: { orgId_kind_externalId: { orgId, kind: "meta_ads", externalId: String(a.id) } },
        create: { orgId, kind: "meta_ads", externalId: String(a.id), ...fields },
        update: fields,
      });
    }
    return { accounts: accounts.length };
  } catch (e) {
    console.error("[meta-ads] falha ao conectar", e instanceof Error ? e.message : e);
    return { error: e instanceof Error ? e.message : "falha" };
  }
}

/** Hoje no fuso da conta (é o fuso em que a Meta fecha o dia). */
function todayIn(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Lê o gasto de uma conta ligada. Devolve quantos dias×anúncio gravou (null = não rodou). */
export async function syncAccount(accountId: string, now = new Date()): Promise<number | null> {
  const acc = await prisma.marketingAccount.findUnique({ where: { id: accountId }, include: { connection: true } });
  if (!acc || !acc.enabled || acc.connection.status !== "active") return null;
  // Trava: duas rodadas do relógio (ou o botão) não leem a mesma conta juntas.
  const lock = await prisma.marketingAccount.updateMany({
    where: { id: acc.id, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
    data: { syncLockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (!lock.count) return null;

  const today = todayIn(acc.timezone, now);
  const { since, until } = syncWindow(acc.syncedThrough ? acc.syncedThrough.toISOString().slice(0, 10) : null, today);
  try {
    if (acc.connection.expiresAt && acc.connection.expiresAt < now) throw new MetaError("O acesso à Meta venceu.", 190);
    const token = decryptSecret(acc.connection.secrets);
    const rows = await allPages(
      await graphGet(`${acc.externalId}/insights`, {
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: INSIGHT_FIELDS,
        limit: "500",
        access_token: token,
      })
    );
    let saved = 0;
    for (const raw of rows) {
      const r = parseInsightRow(raw);
      if (!r) continue;
      const { date, ...rest } = r;
      const data = { ...rest, currency: acc.currency };
      const day = new Date(`${date}T00:00:00Z`);
      await prisma.adDailyMetric.upsert({
        where: { accountId_date_adId: { accountId: acc.id, date: day, adId: r.adId } },
        create: { orgId: acc.orgId, accountId: acc.id, date: day, ...data },
        update: data,
      });
      saved++;
    }
    await prisma.marketingAccount.update({
      where: { id: acc.id },
      data: {
        syncedThrough: new Date(`${dayBefore(today)}T00:00:00Z`),
        lastSyncAt: now,
        lastSyncError: null,
        nextSyncAt: new Date(now.getTime() + SYNC_EVERY_MS),
        syncLockedUntil: null,
      },
    });
    return saved;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Falha ao ler a Meta.";
    // 190 = token inválido/vencido: só reconectando resolve.
    if (e instanceof MetaError && e.code === 190) {
      await prisma.marketingConnection.update({ where: { id: acc.connectionId }, data: { status: "needs_reauth", lastError: msg } });
    }
    await prisma.marketingAccount.update({
      where: { id: acc.id },
      data: { lastSyncError: msg, nextSyncAt: new Date(now.getTime() + SYNC_EVERY_MS), syncLockedUntil: null },
    });
    console.error("[meta-ads] falha ao sincronizar", acc.externalId, msg);
    return null;
  }
}

/** Passo do relógio: contas ligadas com leitura vencida, até acabar o orçamento. */
export async function syncDueMetaAccounts({ orcamentoMs }: { orcamentoMs: number }): Promise<{ contas: number; linhas: number }> {
  const start = Date.now();
  const due = await prisma.marketingAccount.findMany({
    where: { kind: "meta_ads", enabled: true, nextSyncAt: { lte: new Date() }, connection: { status: "active" } },
    orderBy: { nextSyncAt: "asc" },
    take: 20,
    select: { id: true },
  });
  let contas = 0;
  let linhas = 0;
  for (const a of due) {
    if (Date.now() - start > orcamentoMs) break;
    const n = await syncAccount(a.id);
    if (n !== null) {
      contas++;
      linhas += n;
    }
  }
  return { contas, linhas };
}

/** Desconecta: tira a permissão do app na Meta (melhor esforço) e apaga o token. Métricas ficam. */
export async function disconnectMeta(orgId: string): Promise<void> {
  const conns = await prisma.marketingConnection.findMany({ where: { orgId, provider: "meta", status: { not: "revoked" } } });
  for (const c of conns) {
    const token = decryptSecret(c.secrets);
    if (token) {
      await fetch(`${graphBase()}/me/permissions?${new URLSearchParams({ access_token: token })}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    }
    await prisma.marketingConnection.update({ where: { id: c.id }, data: { status: "revoked", secrets: "", expiresAt: null } });
    await prisma.marketingAccount.updateMany({ where: { connectionId: c.id }, data: { enabled: false } });
  }
}

/** "Apagar dados importados": some todo o gasto que veio da Meta para este contrato. */
export async function deleteImportedMeta(orgId: string): Promise<number> {
  const r = await prisma.adDailyMetric.deleteMany({ where: { orgId, account: { kind: "meta_ads" } } });
  return r.count;
}

/** signed_request das chamadas da Meta (desautorização / exclusão de dados). */
export function parseSignedRequest(signed: string | null | undefined, secret: string): { user_id: string } | null {
  const [sig, payload] = (signed ?? "").split(".");
  if (!sig || !payload) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const got = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return data?.user_id ? { user_id: String(data.user_id) } : null;
  } catch {
    return null;
  }
}

/** A pessoa tirou o app na Meta (ou pediu exclusão): apaga o token das conexões dela. */
export async function revokeByMetaUser(userId: string): Promise<number> {
  const r = await prisma.marketingConnection.updateMany({
    where: { provider: "meta", externalUserId: userId },
    data: { status: "revoked", secrets: "", expiresAt: null, lastError: "Acesso removido na Meta." },
  });
  return r.count;
}
