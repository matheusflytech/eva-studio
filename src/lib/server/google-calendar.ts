import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import type { Busy } from "@/lib/google-calendar/slots";

// ---------------------------------------------------------------------------
// Google Agenda: cada pessoa liga a própria conta (OAuth do Google, fetch puro).
//   1. /api/integrations/google-calendar/start manda para o Google com um
//      state guardado num cookie httpOnly (10 min, uso único).
//   2. O callback troca o code por tokens; o refresh token vai cifrado para
//      GoogleCalendarConnection (uma por pessoa por contrato).
//   3. Calendário e IA pedem um access token novo a partir dele quando
//      precisam (fica em memória até perto de vencer).
// Escopos: e-mail, lista de agendas (só leitura) e eventos (ler e criar).
// ---------------------------------------------------------------------------

export const COOKIE_GOOGLE = "gcal_oauth";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export interface StoredCalendar {
  id: string;
  name: string;
  color: string | null;
  show: boolean;
  primary?: boolean;
}

export type Connection = { id: string; orgId: string; userId: string; email: string; secrets: string; calendars: unknown };

export function googleApp(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const newState = () => crypto.randomBytes(24).toString("hex");

export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // Sem "consent" o Google não devolve refresh token na segunda conexão.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

/** Cookie: "<orgId>|<userId>|<state>". */
export function readCookie(value: string | undefined): { orgId: string; userId: string; state: string } | null {
  const p = (value ?? "").split("|");
  return p.length === 3 && p.every(Boolean) ? { orgId: p[0], userId: p[1], state: p[2] } : null;
}

export function sameState(expected: string, got: string | null): boolean {
  if (!got || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

/** Troca o code do callback por refresh token e e-mail da conta. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; accessToken: string; email: string } | { error: string }> {
  const app = googleApp();
  if (!app) return { error: "sem_app" };
  try {
    const { ok, data } = await tokenRequest({ code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
    if (!ok) return { error: "troca_falhou" };
    const refreshToken = String(data.refresh_token ?? "");
    const accessToken = String(data.access_token ?? "");
    // id_token veio direto do Google por TLS nesta mesma chamada: só lemos o e-mail.
    const payload = String(data.id_token ?? "").split(".")[1] ?? "";
    const email = String(JSON.parse(Buffer.from(payload, "base64url").toString() || "{}").email ?? "");
    if (!refreshToken || !accessToken || !email) return { error: "sem_token" };
    return { refreshToken, accessToken, email };
  } catch {
    return { error: "sem_resposta" };
  }
}

const tokenCache = new Map<string, { token: string; until: number }>();

/** Erro do Google que pede reconectar (acesso revogado, senha trocada...). */
export class GoogleAuthError extends Error {}

async function accessTokenOf(conn: Connection): Promise<string> {
  const hit = tokenCache.get(conn.id);
  if (hit && hit.until > Date.now()) return hit.token;
  const app = googleApp();
  if (!app) throw new Error("App do Google não configurado neste ambiente.");
  const refresh = JSON.parse(decryptSecret(conn.secrets) || "{}").refreshToken as string | undefined;
  if (!refresh) throw new GoogleAuthError("Conexão sem token.");
  const { ok, data } = await tokenRequest({ refresh_token: refresh, client_id: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token" });
  if (!ok) {
    if (data.error === "invalid_grant") {
      await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { status: "error", lastError: "Acesso revogado no Google: conecte de novo." } }).catch(() => {});
      throw new GoogleAuthError("Acesso ao Google Agenda revogado.");
    }
    throw new Error(`Google recusou o token (${String(data.error ?? "erro")}).`);
  }
  const token = String(data.access_token);
  tokenCache.set(conn.id, { token, until: Date.now() + (Number(data.expires_in ?? 3600) - 120) * 1000 });
  return token;
}

async function api<T>(conn: Connection | { token: string }, path: string, init?: RequestInit): Promise<T> {
  const token = "token" in conn ? conn.token : await accessTokenOf(conn);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Agenda: ${data?.error?.message ?? res.status}`);
  return data as T;
}

/** Agendas da conta. As que a pessoa já marca no Google começam ligadas. */
export async function listCalendars(conn: Connection | { token: string }): Promise<StoredCalendar[]> {
  const d = await api<{ items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; selected?: boolean; primary?: boolean }[] }>(
    conn,
    "/users/me/calendarList?minAccessRole=reader&maxResults=100"
  );
  return (d.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: c.backgroundColor ?? null,
    show: !!(c.primary || c.selected),
    ...(c.primary ? { primary: true } : {}),
  }));
}

export interface GoogleEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  link: string | null;
  meet: string | null;
  busy: boolean;
}

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/** "2026-11-02" (dia todo do Google) → meia-noite de SP, como as tarefas de dia todo. */
const allDayStart = (d: string) => `${d}T03:00:00.000Z`;

export async function listEvents(conn: Connection, calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const q = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const d = await api<{ items?: RawEvent[] }>(conn, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
  return (d.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.start)
    .map((e) => {
      const allDay = !e.start!.dateTime;
      const declined = e.attendees?.some((a) => a.self && a.responseStatus === "declined");
      return {
        id: e.id,
        title: e.summary || "(sem título)",
        start: allDay ? allDayStart(e.start!.date!) : e.start!.dateTime!,
        end: allDay ? null : (e.end?.dateTime ?? null),
        allDay,
        link: e.htmlLink ?? null,
        meet: e.hangoutLink ?? null,
        busy: !allDay && e.transparency !== "transparent" && !declined,
      };
    });
}

export async function busyOf(conn: Connection, calendarId: string, timeMin: Date, timeMax: Date): Promise<Busy[]> {
  const events = await listEvents(conn, calendarId, timeMin, timeMax);
  return events.filter((e) => e.busy && e.end).map((e) => ({ start: new Date(e.start), end: new Date(e.end!) }));
}

export async function createEvent(
  conn: Connection,
  calendarId: string,
  ev: { title: string; description?: string; start: Date; end: Date; attendee?: string | null; meet: boolean }
): Promise<{ link: string | null; meet: string | null }> {
  const body = {
    summary: ev.title,
    description: ev.description,
    start: { dateTime: ev.start.toISOString() },
    end: { dateTime: ev.end.toISOString() },
    ...(ev.attendee ? { attendees: [{ email: ev.attendee }] } : {}),
    ...(ev.meet ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
  const q = new URLSearchParams({ conferenceDataVersion: ev.meet ? "1" : "0", sendUpdates: ev.attendee ? "all" : "none" });
  const r = await api<RawEvent>(conn, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`, { method: "POST", body: JSON.stringify(body) });
  return { link: r.htmlLink ?? null, meet: r.hangoutLink ?? null };
}

export async function revoke(conn: Connection): Promise<void> {
  const refresh = JSON.parse(decryptSecret(conn.secrets) || "{}").refreshToken as string | undefined;
  tokenCache.delete(conn.id);
  if (!refresh) return;
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

export const sealRefreshToken = (refreshToken: string) => encryptSecret(JSON.stringify({ refreshToken }));

export function calendarsOf(conn: { calendars: unknown }): StoredCalendar[] {
  return Array.isArray(conn.calendars) ? (conn.calendars as StoredCalendar[]) : [];
}
