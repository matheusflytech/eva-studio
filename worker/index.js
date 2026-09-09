// Eva Studio — worker de WhatsApp via QR code (Baileys).
// Processo separado e sempre ligado (Railway), porque o Baileys mantém um
// socket aberto com o WhatsApp — isso não roda em função serverless da Vercel.
// Este worker só fala com o mesmo Postgres do app principal (via tabelas
// eva_studio_whatsapp_connections / eva_studio_agents), não expõe API própria
// além de um health check.

import http from "node:http";
import pg from "pg";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { loadAuthState } from "./auth-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida. Encerrando.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

const sessions = new Map(); // agentId -> { sock }

function extractText(msg) {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  );
}

async function getAgent(agentId) {
  const { rows } = await pool.query(
    `select id, name, tone, language, instructions, guidelines, "outboundUrl" from eva_studio_agents where id = $1`,
    [agentId]
  );
  return rows[0] ?? null;
}

async function setConnectionState(agentId, patch) {
  const fields = Object.keys(patch);
  const setClause = fields.map((f, i) => `"${f}" = $${i + 2}`).join(", ");
  await pool.query(
    `update eva_studio_whatsapp_connections set ${setClause}, "updatedAt" = now() where "agentId" = $1`,
    [agentId, ...fields.map((f) => patch[f])]
  );
}

async function replyViaAgentWebhook(agent, text, conversationId) {
  if (!agent.outboundUrl) return "Esse agente ainda não tem um webhook de saída configurado no Eva Studio.";
  try {
    const res = await fetch(agent.outboundUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversation_id: conversationId,
        agent: {
          id: agent.id,
          name: agent.name,
          tone: agent.tone,
          language: agent.language,
          instructions: agent.instructions,
          guidelines: agent.guidelines,
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return typeof data?.reply === "string" && data.reply.trim() ? data.reply : null;
  } catch (err) {
    logger.error({ err }, "Falha ao chamar o webhook do agente");
    return null;
  }
}

async function startSession(agentId) {
  if (sessions.has(agentId)) return;
  sessions.set(agentId, { starting: true });

  const { state, saveCreds } = await loadAuthState(pool, agentId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sessions.set(agentId, { sock });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr);
      await setConnectionState(agentId, { status: "qr_pending", qrDataUrl });
    }

    if (connection === "open") {
      const phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      await setConnectionState(agentId, { status: "connected", qrDataUrl: null, phoneNumber, lastError: null });
      logger.info({ agentId, phoneNumber }, "WhatsApp conectado");
    }

    if (connection === "close") {
      sessions.delete(agentId);
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        await pool.query(
          `update eva_studio_whatsapp_connections set status = 'disconnected', "qrDataUrl" = null, "phoneNumber" = null, creds = null, keys = null, "updatedAt" = now() where "agentId" = $1`,
          [agentId]
        );
        logger.info({ agentId }, "WhatsApp desconectado (logout)");
      } else {
        await setConnectionState(agentId, { status: "requesting", lastError: "Conexão caiu, tentando de novo..." });
        setTimeout(() => startSession(agentId), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const text = extractText(msg);
      if (!text) continue;

      const agent = await getAgent(agentId);
      if (!agent) continue;

      const remoteJid = msg.key.remoteJid;
      const conversationId = `whatsapp:${remoteJid}`;
      const reply = await replyViaAgentWebhook(agent, text, conversationId);
      if (reply) {
        await sock.sendMessage(remoteJid, { text: reply });
      }
    }
  });
}

async function stopSession(agentId) {
  const session = sessions.get(agentId);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch (err) {
      logger.warn({ err, agentId }, "Erro ao fazer logout, limpando mesmo assim");
    }
  }
  sessions.delete(agentId);
  await pool.query(
    `update eva_studio_whatsapp_connections set status = 'disconnected', "qrDataUrl" = null, "phoneNumber" = null, creds = null, keys = null, "updatedAt" = now() where "agentId" = $1`,
    [agentId]
  );
}

async function pollForWork() {
  try {
    const { rows } = await pool.query(
      `select "agentId", status from eva_studio_whatsapp_connections where status in ('requesting', 'logging_out')`
    );
    for (const row of rows) {
      if (row.status === "requesting" && !sessions.has(row.agentId)) {
        startSession(row.agentId).catch((err) => logger.error({ err, agentId: row.agentId }, "Falha ao iniciar sessão"));
      }
      if (row.status === "logging_out") {
        stopSession(row.agentId).catch((err) => logger.error({ err, agentId: row.agentId }, "Falha ao encerrar sessão"));
      }
    }
  } catch (err) {
    logger.error({ err }, "Erro no polling");
  }
}

async function resumeConnectedSessions() {
  const { rows } = await pool.query(`select "agentId" from eva_studio_whatsapp_connections where status = 'connected'`);
  for (const row of rows) {
    startSession(row.agentId).catch((err) => logger.error({ err, agentId: row.agentId }, "Falha ao retomar sessão"));
  }
}

resumeConnectedSessions();
setInterval(pollForWork, 4000);

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("eva-studio whatsapp worker ok\n");
  })
  .listen(process.env.PORT || 3010, () => {
    logger.info(`Health check ouvindo na porta ${process.env.PORT || 3010}`);
  });
