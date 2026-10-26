import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Gera o script do widget dinamicamente — embute o agentId, o nome do
// agente e a origem da própria API direto no JS (evita uma chamada extra
// só pra descobrir isso). Roda em Shadow DOM pra não vazar/receber CSS do
// site em que for colado. Sem nenhuma dependência (React, etc.) — precisa
// ser leve e funcionar em qualquer site, de qualquer stack.
//
// Dois jeitos de montar, no MESMO script — decide sozinho pelo que existir
// na página:
// - Bolha flutuante (padrão): cria o balão sozinho, canto da tela.
// - Inline: se existir um elemento com `data-eva-widget="inline"` na
//   página, o painel de chat nasce JÁ ABERTO dentro dele (sem bolha,
//   sem esconder atrás de um clique) — pensado pra ficar embutido direto
//   no hero do site, não flutuando por cima.
export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });

  if (!agent || !agent.widgetEnabled) {
    return new NextResponse("// Widget não disponível pra esse agente.", {
      status: 404,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const origin = new URL(request.url).origin;
  const agentName = JSON.stringify(agent.name || "Assistente");

  const script = `
(function () {
  var AGENT_ID = ${JSON.stringify(agentId)};
  var AGENT_NAME = ${agentName};
  var API_ORIGIN = ${JSON.stringify(origin)};
  var STORAGE_KEY = "eva_widget_contact_" + AGENT_ID;
  var INLINE_TARGET = document.querySelector('[data-eva-widget="inline"]');
  var MODE = INLINE_TARGET ? "inline" : "bubble";

  function getContactId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = "web_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }
  var isReturningVisitor = !!localStorage.getItem(STORAGE_KEY);
  var contactId = getContactId();

  var SHARED_CSS =
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}' +
    '.header{background:#4f46e5;color:#fff;padding:14px 16px;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;}' +
    '.close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;opacity:.85;}' +
    '.messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f9;}' +
    '.msg{max-width:82%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;}' +
    '.msg.bot{align-self:flex-start;background:#fff;border:1px solid #e5e5ea;color:#111;}' +
    '.msg.user{align-self:flex-end;background:#4f46e5;color:#fff;}' +
    '.options{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%;}' +
    '.media{align-self:flex-start;max-width:80%;max-height:240px;border-radius:14px;}' +
    '.cards{display:flex;gap:8px;overflow-x:auto;align-self:stretch;flex-shrink:0;padding-bottom:4px;}' +
    '.sticker{max-width:120px;max-height:120px;}' +
    '.card{flex:0 0 200px;background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden;font-size:13px;color:#111;}' +
    '.card img{width:100%;height:110px;object-fit:cover;display:block;}' +
    '.card .ct{padding:8px 10px;}' +
    '.card .ct b{display:block;}' +
    '.card .ct p{margin:4px 0 0;color:#555;font-size:12px;}' +
    '.card a{display:block;text-align:center;border-top:1px solid #eee;padding:7px;color:#4f46e5;text-decoration:none;font-size:12px;}' +
    '.opt{border:1px solid #4f46e5;color:#4f46e5;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;}' +
    '.opt:hover{background:#eef2ff;}' +
    '.inputRow{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff;}' +
    '.inputRow input{flex:1;border:1px solid #ddd;border-radius:10px;padding:8px 10px;font-size:13px;outline:none;}' +
    '.inputRow button{background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px;}' +
    '.typing{font-size:12px;color:#888;padding:0 4px;}' +
    '.inputRow button.icon{background:none;color:#666;padding:0 6px;display:flex;align-items:center;}' +
    '.inputRow button.icon:hover{color:#4f46e5;}' +
    '.inputRow button.icon.rec{color:#dc2626;animation:evaRec 1s ease-in-out infinite alternate;}' +
    '@keyframes evaRec{to{opacity:.4;}}' +
    '@media (prefers-reduced-motion:reduce){.inputRow button.icon.rec{animation:none;}}' +
    '.media.user{align-self:flex-end;}' +
    '.transcript{max-width:82%;font-size:11px;line-height:1.4;color:#666;padding:0 4px;white-space:pre-wrap;}' +
    '.transcript.user{align-self:flex-end;text-align:right;}' +
    '.transcript.bot{align-self:flex-start;}';

  var root, panel, messagesEl, input, sendBtn, bubble, closeBtn;

  if (MODE === "inline") {
    var root1 = INLINE_TARGET.attachShadow({ mode: "open" });
    root1.innerHTML =
      '<style>' + SHARED_CSS +
      ':host{all:initial;}' +
      '.panel{display:flex;flex-direction:column;width:100%;height:100%;min-height:420px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden;}' +
      '</style>' +
      '<div class="panel">' +
      '<div class="header"><span>' + AGENT_NAME + '</span></div>' +
      '<div class="messages" id="evaMessages"></div>' +
      '<div class="inputRow"><input id="evaFile" type="file" accept="image/*,application/pdf,.doc,.docx,text/plain" hidden />' +
      '<button class="icon" id="evaAttach" type="button" aria-label="Anexar imagem ou documento" title="Anexar imagem ou documento"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>' +
      '<input id="evaInput" type="text" placeholder="Digite sua mensagem..." />' +
      '<button class="icon" id="evaMic" type="button" aria-label="Gravar áudio" title="Gravar áudio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></button>' +
      '<button id="evaSend">Enviar</button></div>' +
      '</div>';
    root = root1;
  } else {
    var host = document.createElement("div");
    host.style.position = "fixed";
    host.style.bottom = "20px";
    host.style.right = "20px";
    host.style.zIndex = "2147483000";
    document.body.appendChild(host);
    var root2 = host.attachShadow({ mode: "open" });
    root2.innerHTML =
      '<style>' + SHARED_CSS +
      '.bubble{width:56px;height:56px;border-radius:50%;background:#4f46e5;box-shadow:0 4px 16px rgba(0,0,0,.25);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;}' +
      '.bubble svg{width:26px;height:26px;}' +
      '.panel{display:none;flex-direction:column;width:320px;height:440px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.25);overflow:hidden;position:absolute;bottom:68px;right:0;}' +
      '.panel.open{display:flex;}' +
      '</style>' +
      '<button class="bubble" id="evaBubble" aria-label="Abrir chat">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
      '</button>' +
      '<div class="panel" id="evaPanel">' +
      '<div class="header"><span>' + AGENT_NAME + '</span><button class="close" id="evaClose">\\u2715</button></div>' +
      '<div class="messages" id="evaMessages"></div>' +
      '<div class="inputRow"><input id="evaFile" type="file" accept="image/*,application/pdf,.doc,.docx,text/plain" hidden />' +
      '<button class="icon" id="evaAttach" type="button" aria-label="Anexar imagem ou documento" title="Anexar imagem ou documento"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>' +
      '<input id="evaInput" type="text" placeholder="Digite sua mensagem..." />' +
      '<button class="icon" id="evaMic" type="button" aria-label="Gravar áudio" title="Gravar áudio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></button>' +
      '<button id="evaSend">Enviar</button></div>' +
      '</div>';
    root = root2;
    bubble = root.getElementById("evaBubble");
    panel = root.getElementById("evaPanel");
    closeBtn = root.getElementById("evaClose");
  }

  messagesEl = root.getElementById("evaMessages");
  input = root.getElementById("evaInput");
  sendBtn = root.getElementById("evaSend");

  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Mídia (URL do servidor já validada, ou blob: do próprio visitante): nada de innerHTML.
  function addMedia(media, role) {
    var lado = role === "user" ? "user" : "bot";
    var el;
    var imagem = media.type === "image" || media.type === "sticker";
    if (imagem || media.type === "video" || media.type === "audio") {
      el = document.createElement(imagem ? "img" : media.type);
      el.src = media.url;
      if (imagem) el.alt = "";
      else el.controls = true;
      el.className = "media " + lado + (media.type === "sticker" ? " sticker" : "");
    } else {
      el = document.createElement("a");
      el.href = media.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.textContent = media.name || "Abrir arquivo";
      el.className = "msg " + lado;
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Carrossel do bot (URLs já validadas no servidor): textContent, nada de innerHTML.
  function addCards(cards) {
    var wrap = document.createElement("div");
    wrap.className = "cards";
    cards.forEach(function (k) {
      var card = document.createElement("div");
      card.className = "card";
      if (k.imageUrl) {
        var img = document.createElement("img");
        img.src = k.imageUrl;
        img.alt = "";
        card.appendChild(img);
      }
      var ct = document.createElement("div");
      ct.className = "ct";
      var b = document.createElement("b");
      b.textContent = k.title;
      ct.appendChild(b);
      if (k.subtitle) {
        var p = document.createElement("p");
        p.textContent = k.subtitle;
        ct.appendChild(p);
      }
      card.appendChild(ct);
      (k.buttons || []).forEach(function (bt) {
        var a = document.createElement("a");
        a.href = bt.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = bt.label;
        card.appendChild(a);
      });
      wrap.appendChild(card);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addOptions(options) {
    var wrap = document.createElement("div");
    wrap.className = "options";
    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "opt";
      btn.textContent = opt.label;
      btn.onclick = function () {
        addMessage("user", opt.label);
        wrap.remove();
        send({ optionId: opt.id });
      };
      wrap.appendChild(btn);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Transcrição de um áudio, em letra menor embaixo dele (como no WhatsApp).
  function addTranscript(role, text) {
    var t = document.createElement("div");
    t.className = "transcript " + role;
    t.textContent = text;
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return t;
  }

  function setTyping(on) {
    var existing = root.getElementById("evaTyping");
    if (existing) existing.remove();
    if (on) {
      var t = document.createElement("div");
      t.id = "evaTyping";
      t.className = "typing";
      t.textContent = "digitando...";
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function send(payload, aoChegar) {
    setTyping(true);
    startPolling();
    fetch(API_ORIGIN + "/api/widget/" + AGENT_ID + "/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ contactId: contactId }, payload)),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setTyping(false);
        if (aoChegar) aoChegar(data);
        (data.messages || []).forEach(function (m) {
          if (m.cards && m.cards.length) addCards(m.cards);
          else {
            if (m.media) addMedia(m.media);
            if (m.text || !m.media) addMessage("bot", m.text);
          }
          if (m.options && m.options.length) addOptions(m.options);
        });
      })
      .catch(function () {
        setTyping(false);
        addMessage("bot", "Ops, não consegui responder agora. Tenta de novo em instantes.");
      });
  }

  if (MODE === "bubble") {
    bubble.onclick = function () { panel.classList.toggle("open"); };
    closeBtn.onclick = function () { panel.classList.remove("open"); };
  }
  sendBtn.onclick = submit;
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });
  // Quando alguém da equipe assume pela Caixa de entrada, a resposta não volta
  // no POST: o chat busca as novas a cada 5 s, com a aba visível.
  var lastSeen = null, seen = {}, pollTimer = null;
  function poll() {
    if (document.hidden) return;
    var q = "?contactId=" + encodeURIComponent(contactId) + (lastSeen ? "&depois=" + encodeURIComponent(lastSeen) : "");
    fetch(API_ORIGIN + "/api/widget/" + AGENT_ID + "/novas" + q, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        (d.messages || []).forEach(function (m) {
          lastSeen = m.createdAt;
          if (seen[m.id]) return;
          seen[m.id] = true;
          if (m.media) addMedia(m.media, "bot");
          if (m.media && m.media.type === "audio") { if (m.text) addTranscript("bot", "Transcrição: " + m.text); }
          else if (m.text) addMessage("bot", m.text);
        });
      })
      .catch(function () {});
  }
  function startPolling() {
    if (!pollTimer) pollTimer = setInterval(poll, 5000);
  }
  if (isReturningVisitor) startPolling();

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Anexo: imagem, PDF, Word ou texto, até 3 MB (o mesmo limite do servidor).
  var fileInput = root.getElementById("evaFile");
  root.getElementById("evaAttach").onclick = function () { fileInput.click(); };
  fileInput.onchange = function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { addMessage("bot", "Esse arquivo é grande demais. O limite é de 3 MB."); return; }
    var legenda = input.value.trim();
    input.value = "";
    addMedia(file.type.indexOf("image/") === 0 ? { type: "image", url: URL.createObjectURL(file) } : { type: "document", url: URL.createObjectURL(file), name: file.name }, "user");
    if (legenda) addMessage("user", legenda);
    toBase64(file).then(function (b64) {
      send({ text: legenda || undefined, attachment: { base64: b64, mime: file.type, name: file.name } });
    });
  };

  // Áudio: toca no microfone, fala, toca de novo para enviar. O servidor
  // transcreve e a transcrição aparece embaixo do áudio.
  var micBtn = root.getElementById("evaMic");
  var rec = null;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) micBtn.hidden = true;
  micBtn.onclick = function () {
    if (rec) { rec.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var partes = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = function (e) { if (e.data.size) partes.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var tipo = (rec.mimeType || "audio/webm").split(";")[0];
        rec = null;
        micBtn.classList.remove("rec");
        micBtn.setAttribute("aria-label", "Gravar áudio");
        if (!partes.length) return;
        var blob = new Blob(partes, { type: tipo });
        addMedia({ type: "audio", url: URL.createObjectURL(blob) }, "user");
        var tr = addTranscript("user", "Transcrevendo…");
        toBase64(blob).then(function (b64) {
          send({ audio_base64: b64, audio_mime: tipo }, function (d) {
            if (d.transcricao) tr.textContent = "Transcrição: " + d.transcricao;
            else tr.remove();
          });
        });
      };
      rec.start();
      micBtn.classList.add("rec");
      micBtn.setAttribute("aria-label", "Parar e enviar o áudio");
    }).catch(function () {
      addMessage("bot", "Sem acesso ao microfone. Libere o microfone para este site e tente de novo.");
    });
  };

  function submit() {
    var text = input.value.trim();
    if (!text) return;
    addMessage("user", text);
    input.value = "";
    send({ text: text });
  }

  // Primeira visita: puxa a saudação do fluxo (Início -> primeira mensagem)
  // sozinho, sem precisar de texto do visitante. No modo bolha espera um
  // pouco e abre o painel; no modo inline já está visível, então dispara
  // quase na hora.
  if (!isReturningVisitor) {
    setTimeout(function () {
      if (MODE === "bubble") panel.classList.add("open");
      send({});
    }, MODE === "inline" ? 400 : 6000);
  }
})();
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
