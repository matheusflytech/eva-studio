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

const EVA_STUDIO_URL = process.env.EVA_STUDIO_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
if (!EVA_STUDIO_URL || !INTERNAL_API_SECRET) {
  console.error("EVA_STUDIO_URL e/ou INTERNAL_API_SECRET não definidas. Encerrando.");
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

// Toque em botão/lista chega num formato especial, não como texto — extrai o
// id da opção selecionada (o "gatilho") em vez do texto livre.
function extractOptionId(msg) {
  const m = msg.message;
  return m?.buttonsResponseMessage?.selectedButtonId ?? m?.listResponseMessage?.singleSelectReply?.selectedRowId ?? null;
}

// Fala com o motor de fluxo no app principal (Next.js/Vercel) — o worker não
// decide mais nada sozinho sobre o que responder, só repassa mensagens.
async function advanceViaEngine(agentId, contactId, { text, optionId }) {
  try {
    const res = await fetch(`${EVA_STUDIO_URL}/api/conversations/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_API_SECRET },
      body: JSON.stringify({ agentId, channel: "whatsapp_qr", contactId, text, optionId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.messages ?? [];
  } catch (err) {
    logger.error({ err, agentId }, "Falha ao chamar o motor de fluxo");
    return [];
  }
}

async function setConnectionState(agentId, patch) {
  const fields = Object.keys(patch);
  const setClause = fields.map((f, i) => `"${f}" = $${i + 2}`).join(", ");
  await pool.query(
    `update eva_studio_whatsapp_connections set ${setClause}, "updatedAt" = now() where "agentId" = $1`,
    [agentId, ...fields.map((f) => patch[f])]
  );
}

// Manda uma mensagem — texto puro, ou com botões nativos do WhatsApp se a
// resposta do motor trouxer opções (bloco de Captura com menu). Compatibilidade
// de botão nativo varia por versão do WhatsApp do destinatário; por isso o
// texto já vem numerado também, como plano B (ver flow-engine.ts, que aceita
// resposta por número ou por rótulo, não só pelo toque no botão).
async function sendReply(sock, jid, message) {
  if (!message.options || message.options.length === 0) {
    await sock.sendMessage(jid, { text: message.text });
    return;
  }
  const numbered = message.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  try {
    await sock.sendMessage(jid, {
      text: `${message.text}\n\n${numbered}`,
      footer: "Toque numa opção ou digite o número",
      buttons: message.options.slice(0, 3).map((o) => ({ buttonId: o.id, buttonText: { displayText: o.label }, type: 1 })),
      headerType: 1,
    });
  } catch {
    await sock.sendMessage(jid, { text: `${message.text}\n\n${numbered}` });
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
      const optionId = extractOptionId(msg);
      const text = extractText(msg);
      if (!optionId && !text) continue;

      const remoteJid = msg.key.remoteJid;
      const replies = await advanceViaEngine(agentId, remoteJid, { text, optionId });
      for (const reply of replies) {
        await sendReply(sock, remoteJid, reply);
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

// Blocos "Esperar" ficam parados até alguém escrever de novo (o motor só
// reage a eventos). Como esse worker fica ligado 24/7, aproveita o mesmo
// polling pra cutucar as conversas cujo prazo já venceu, sem precisar de
// mensagem nova do contato.
async function resumeDueWaits() {
  try {
    const { rows } = await pool.query(
      `select "agentId", "contactId" from eva_studio_conversations
       where channel = 'whatsapp_qr' and status = 'active'
         and variables ? '__wait_until'
         and (variables->>'__wait_until')::timestamptz <= now()`
    );
    for (const row of rows) {
      const session = sessions.get(row.agentId);
      if (!session?.sock) continue;
      const replies = await advanceViaEngine(row.agentId, row.contactId, {});
      for (const reply of replies) {
        await sendReply(session.sock, row.contactId, reply);
      }
    }
  } catch (err) {
    logger.error({ err }, "Erro ao retomar esperas vencidas");
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
setInterval(resumeDueWaits, 15000);

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("eva-studio whatsapp worker ok\n");
  })
  .listen(process.env.PORT || 3010, () => {
    logger.info(`Health check ouvindo na porta ${process.env.PORT || 3010}`);
  });
