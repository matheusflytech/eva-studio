// Eva Studio — worker de WhatsApp via QR code (Baileys).
// Processo separado e sempre ligado (Railway), porque o Baileys mantém um
// socket aberto com o WhatsApp — isso não roda em função serverless da Vercel.
// Este worker só fala com o mesmo Postgres do app principal, não expõe API
// própria além de um health check. Cada sessão é de um canal do contrato
// (eva_studio_canais_whatsapp_qr) ou, antes do SQL de canais, de um agente
// (eva_studio_whatsapp_connections) — ver fonte.js. "chave" = id da sessão.

import http from "node:http";
import pg from "pg";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { loadAuthState } from "./auth-store.js";
import {
  agenteDaSessao,
  detectarModo,
  gravarEstado,
  limparSessao,
  sessaoDoAgente,
  sessoesConectadas,
  sessoesPendentes,
} from "./fonte.js";
import { MINUTOS_TRAVADO, expirarTravados, marcarEnviado, marcarFalha, reivindicarItens } from "./fila.js";
import { decidirReconexao } from "./desconexao.js";

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

// Valida o certificado TLS do Postgres por padrão (evita MITM). Se o provedor
// usar cert self-signed e não der pra fornecer a CA, dá pra desligar
// explicitamente com DATABASE_SSL_REJECT_UNAUTHORIZED=false — decisão
// consciente, não o default silencioso de antes.
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
// Teto de conexões. Sem isto o node-postgres abre até 10, e este processo
// sozinho comia 10 das 15 vagas do pooler em modo sessão — sobrava quase nada
// pro app. O worker faz polling curto e sequencial; duas conexões bastam.
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX || 2),
  idleTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized, ca: process.env.DATABASE_SSL_CA || undefined },
});
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

const sessions = new Map(); // chave da sessão (canalId ou agentId) -> { sock }
// "canal" ou "agente": decidido na subida pela existência da tabela nova.
let MODO = "agente";

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

// Anexo que o cliente mandou. O WhatsApp entrega cada tipo numa chave
// diferente da mensagem; aqui vira um formato só.
const LIMITE_DE_MIDIA = 16 * 1024 * 1024;
const ROTULO_DE_MIDIA = { image: "Foto", audio: "Áudio", video: "Vídeo", document: "Documento", sticker: "Figurinha" };

function extractMedia(msg) {
  const m = msg.message;
  if (!m) return null;
  if (m.imageMessage) return { tipo: "image", info: m.imageMessage };
  if (m.audioMessage) return { tipo: "audio", info: m.audioMessage };
  if (m.videoMessage) return { tipo: "video", info: m.videoMessage };
  if (m.documentMessage) return { tipo: "document", info: m.documentMessage };
  if (m.stickerMessage) return { tipo: "sticker", info: m.stickerMessage };
  return null;
}

// Baixa o arquivo do WhatsApp e manda direto pro storage do app. O worker não
// tem a chave do storage de propósito: pede uma URL de envio ao app.
async function guardarMidia(agentId, sock, msg, midia) {
  try {
    const tamanho = Number(midia.info.fileLength ?? 0);
    if (tamanho > LIMITE_DE_MIDIA) return null;

    const buffer = await downloadMediaMessage(msg, "buffer", {}, {
      logger,
      reuploadRequest: sock.updateMediaMessage,
    });
    if (!buffer || buffer.length === 0 || buffer.length > LIMITE_DE_MIDIA) return null;

    // "audio/ogg; codecs=opus" -> "audio/ogg"
    const mime = String(midia.info.mimetype ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    const nome = midia.info.fileName ?? undefined;

    const pedido = await fetch(`${EVA_STUDIO_URL}/api/internal/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_API_SECRET },
      body: JSON.stringify({ agentId, mime, size: buffer.length, name: nome }),
    });
    if (!pedido.ok) return null;
    const autorizacao = await pedido.json();

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([buffer], { type: mime }));
    const envio = await fetch(autorizacao.uploadUrl, { method: "PUT", body: form });
    if (!envio.ok) return null;

    return {
      path: autorizacao.path,
      type: midia.tipo === "sticker" ? "sticker" : autorizacao.type,
      mime,
      name: nome,
      size: buffer.length,
    };
  } catch (err) {
    logger.error({ err, agentId }, "Falha ao guardar mídia recebida");
    return null;
  }
}

// Toque em botão/lista chega num formato especial, não como texto — extrai o
// id da opção selecionada (o "gatilho") em vez do texto livre.
function extractOptionId(msg) {
  const m = msg.message;
  return m?.buttonsResponseMessage?.selectedButtonId ?? m?.listResponseMessage?.singleSelectReply?.selectedRowId ?? null;
}

// Fala com o motor de fluxo no app principal (Next.js/Vercel) — o worker não
// decide mais nada sozinho sobre o que responder, só repassa mensagens.
async function advanceViaEngine(agentId, contactId, { text, optionId, media, externalId, canalId }) {
  try {
    const res = await fetch(`${EVA_STUDIO_URL}/api/conversations/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_API_SECRET },
      // canalId vai junto no modo canal: canal sem agente ainda é registrado
      // no app (Conversas), só não responde.
      body: JSON.stringify({ agentId, canalId, channel: "whatsapp_qr", contactId, text, optionId, media, externalId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.messages ?? [];
  } catch (err) {
    logger.error({ err, agentId }, "Falha ao chamar o motor de fluxo");
    return [];
  }
}

async function setConnectionState(chave, patch) {
  await gravarEstado(pool, MODO, chave, patch);
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

// Quedas seguidas de cada sessão sem chegar a abrir (para esperar mais a cada vez).
const quedas = new Map();

async function startSession(chave) {
  if (sessions.has(chave)) return;
  sessions.set(chave, { starting: true });

  let state, saveCreds, sock;
  try {
    ({ state, saveCreds } = await loadAuthState(pool, chave, MODO));
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
    });
  } catch (err) {
    // Sem isto o "starting" ficava para sempre: o polling e a reconexão pulavam
    // o canal, e a tela culpava o worker, que estava vivo.
    sessions.delete(chave);
    await setConnectionState(chave, { status: "requesting", qrDataUrl: null, lastError: "Não deu para abrir a sessão, tentando de novo..." }).catch(() => {});
    throw err;
  }

  sessions.set(chave, { sock });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr);
      await setConnectionState(chave, { status: "qr_pending", qrDataUrl });
    }

    if (connection === "open") {
      quedas.delete(chave);
      const phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      await setConnectionState(chave, { status: "connected", qrDataUrl: null, phoneNumber, lastError: null });
      logger.info({ chave, phoneNumber }, "WhatsApp conectado");
    }

    if (connection === "close") {
      sessions.delete(chave);
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      // Regras em desconexao.js: logout limpa; sessão aberta em outro lugar ou
      // número recusado param; o resto reconecta, esperando mais a cada queda.
      const tentativas = quedas.get(chave) ?? 0;
      const decisao = loggedOut ? { acao: "logout" } : decidirReconexao(statusCode, { pareado: !!state.creds?.registered, tentativas });
      if (decisao.acao === "logout") {
        quedas.delete(chave);
        await limparSessao(pool, MODO, chave);
        logger.info({ chave }, "WhatsApp desconectado (logout)");
      } else if (decisao.acao === "parar") {
        quedas.delete(chave);
        logger.warn({ chave, statusCode }, "Sessão parada");
        await setConnectionState(chave, { status: "disconnected", qrDataUrl: null, lastError: decisao.erro });
      } else {
        if (decisao.erro) quedas.set(chave, tentativas + 1);
        logger.warn({ chave, statusCode, atrasoMs: decisao.atrasoMs }, decisao.erro ? "Conexão caiu" : "Sessão reiniciando (normal)");
        // O QR da sessão que caiu já não vale: sai da tela até vir o novo.
        await setConnectionState(chave, { status: "requesting", qrDataUrl: null, lastError: decisao.erro });
        setTimeout(() => startSession(chave).catch((err) => logger.error({ err, chave }, "Falha ao reconectar")), decisao.atrasoMs);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const optionId = extractOptionId(msg);
      let text = extractText(msg);
      const midia = extractMedia(msg);
      if (!optionId && !text && !midia) continue;

      // Foto, áudio, documento: antes o worker ignorava tudo que não fosse
      // texto, e o que o cliente mandava de arquivo sumia sem rastro.
      // O agente é lido a cada mensagem: no modo canal ele pode ter mudado
      // (aba Canais do agente) sem a sessão reiniciar.
      const agentId = await agenteDaSessao(pool, MODO, chave);
      const canalId = MODO === "canal" ? chave : undefined;

      let anexo;
      if (midia && !optionId) {
        // Sem agente não há contrato a quem guardar o arquivo: fica só o rótulo.
        anexo = agentId ? await guardarMidia(agentId, sock, msg, midia) : null;
        const rotulo = ROTULO_DE_MIDIA[midia.tipo] ?? "Anexo";
        text = text || `[${rotulo}]`;
        if (!anexo) text = `${text} (não foi possível baixar o arquivo)`;
      }

      const remoteJid = msg.key.remoteJid;
      const replies = await advanceViaEngine(agentId, remoteJid, {
        text,
        optionId,
        media: anexo,
        externalId: msg.key.id,
        canalId,
      });
      for (const reply of replies) {
        await sendReply(sock, remoteJid, reply);
      }
    }
  });
}

async function stopSession(chave) {
  const session = sessions.get(chave);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch (err) {
      logger.warn({ err, chave }, "Erro ao fazer logout, limpando mesmo assim");
    }
  }
  sessions.delete(chave);
  await limparSessao(pool, MODO, chave);
}

async function pollForWork() {
  try {
    const rows = await sessoesPendentes(pool, MODO);
    for (const row of rows) {
      if (row.status === "requesting" && !sessions.has(row.chave)) {
        startSession(row.chave).catch((err) => logger.error({ err, chave: row.chave }, "Falha ao iniciar sessão"));
      }
      if (row.status === "logging_out") {
        stopSession(row.chave).catch((err) => logger.error({ err, chave: row.chave }, "Falha ao encerrar sessão"));
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
      const chave = await sessaoDoAgente(pool, MODO, row.agentId);
      const session = chave ? sessions.get(chave) : null;
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

// Drena a fila de saída (respostas manuais de atendente + disparos em
// massa) pro WhatsApp via QR — o app principal grava aqui porque ele não
// segura o socket do Baileys (ver eva_studio_outbound_queue no schema).
// Os itens são reivindicados com FOR UPDATE SKIP LOCKED (ver fila.js), e o
// placar do disparo/variante é somado aqui, quando sai de verdade — o app só
// soma o que ele mesmo mandou direto.
let drenando = false;
async function drainOutboundQueue() {
  // setInterval não espera a rodada anterior: sem isto, uma rodada lenta
  // (mídia grande) se sobreporia à seguinte no mesmo processo.
  if (drenando) return;
  drenando = true;
  try {
    await expirarTravados(pool, MINUTOS_TRAVADO);
    const rows = await reivindicarItens(pool, 20);
    // O item guarda o agente; a sessão é a do canal QR que ele atende agora.
    const chaves = new Map();
    for (const row of rows) {
      if (!chaves.has(row.agentId)) chaves.set(row.agentId, await sessaoDoAgente(pool, MODO, row.agentId));
      const chave = chaves.get(row.agentId);
      const session = chave ? sessions.get(chave) : null;
      if (!session?.sock) {
        await marcarFalha(pool, row, "WhatsApp não conectado");
        continue;
      }
      try {
        if (row.mediaPath) {
          // O arquivo vive no storage do app; ele devolve um link temporário.
          const r = await fetch(
            `${EVA_STUDIO_URL}/api/internal/media?path=${encodeURIComponent(row.mediaPath)}`,
            { headers: { "X-Internal-Secret": INTERNAL_API_SECRET } }
          );
          if (!r.ok) throw new Error("não consegui buscar o arquivo");
          const { url } = await r.json();

          const legenda = row.text || undefined;
          let conteudo;
          if (row.mediaType === "image") conteudo = { image: { url }, caption: legenda };
          else if (row.mediaType === "video") conteudo = { video: { url }, caption: legenda };
          else if (row.mediaType === "audio") conteudo = { audio: { url }, mimetype: row.mediaMime || "audio/mpeg" };
          else if (row.mediaType === "sticker") conteudo = { sticker: { url } };
          else conteudo = { document: { url }, mimetype: row.mediaMime || "application/octet-stream", fileName: row.mediaName || "arquivo", caption: legenda };

          await session.sock.sendMessage(row.contactId, conteudo);
          // Áudio e figurinha não levam legenda: o texto vai em mensagem à parte.
          if (legenda && (row.mediaType === "audio" || row.mediaType === "sticker")) {
            await session.sock.sendMessage(row.contactId, { text: legenda });
          }
        } else {
          await session.sock.sendMessage(row.contactId, { text: row.text });
        }
        await marcarEnviado(pool, row);
      } catch (err) {
        await marcarFalha(pool, row, String(err?.message ?? err));
      }
    }
  } catch (err) {
    logger.error({ err }, "Erro ao drenar fila de saída");
  } finally {
    drenando = false;
  }
}

async function resumeConnectedSessions() {
  for (const chave of await sessoesConectadas(pool, MODO)) {
    startSession(chave).catch((err) => logger.error({ err, chave }, "Falha ao retomar sessão"));
  }
}

// Relógio das sequências (drip) e dos disparos agendados. Quem faz o trabalho
// é o app (a rota /api/internal/scheduler), porque é lá que vivem as regras de
// janela de 24h, modelo aprovado e envio pela Graph API. O worker só entra
// aqui como batida de relógio: a Vercel no plano grátis dá cron 1x por dia, e
// esse processo já fica ligado o tempo todo de qualquer forma.
async function tickScheduler() {
  try {
    const res = await fetch(EVA_STUDIO_URL + "/api/internal/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_API_SECRET },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Scheduler respondeu com erro");
      return;
    }
    const data = await res.json();
    const entregues =
      (data.sequences?.delivered ?? 0) + (data.broadcasts?.sent ?? 0) + (data.broadcasts?.queued ?? 0);
    if (entregues > 0) logger.info(data, "Scheduler entregou mensagens");
  } catch (err) {
    logger.error({ err }, "Erro ao chamar o scheduler");
  }
}

// Decide o modo antes de qualquer sessão: com a tabela de canais, uma sessão
// por canal; sem ela, por agente (como antes do SQL 2026-10-22).
MODO = await detectarModo(pool);
logger.warn({ modo: MODO }, "Worker do WhatsApp por QR subindo");
await resumeConnectedSessions();
setInterval(pollForWork, 4000);
setInterval(resumeDueWaits, 15000);
setInterval(drainOutboundQueue, 4000);
// 60s: passo de régua e disparo agendado são medidos em minutos, não em
// segundos — varrer mais rápido só gastaria conexão do banco à toa.
setInterval(tickScheduler, 60000);

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("eva-studio whatsapp worker ok\n");
  })
  .listen(process.env.PORT || 3010, () => {
    logger.info(`Health check ouvindo na porta ${process.env.PORT || 3010}`);
  });
