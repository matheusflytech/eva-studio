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
    '.msg{max-width:82%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.4;}' +
    '.msg.bot{align-self:flex-start;background:#fff;border:1px solid #e5e5ea;color:#111;}' +
    '.msg.user{align-self:flex-end;background:#4f46e5;color:#fff;}' +
    '.options{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%;}' +
    '.opt{border:1px solid #4f46e5;color:#4f46e5;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;}' +
    '.opt:hover{background:#eef2ff;}' +
    '.inputRow{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff;}' +
    '.inputRow input{flex:1;border:1px solid #ddd;border-radius:10px;padding:8px 10px;font-size:13px;outline:none;}' +
    '.inputRow button{background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px;}' +
    '.typing{font-size:12px;color:#888;padding:0 4px;}';

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
      '<div class="inputRow"><input id="evaInput" type="text" placeholder="Digite sua mensagem..." /><button id="evaSend">Enviar</button></div>' +
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
      '<div class="inputRow"><input id="evaInput" type="text" placeholder="Digite sua mensagem..." /><button id="evaSend">Enviar</button></div>' +
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

  function send(payload) {
    setTyping(true);
    fetch(API_ORIGIN + "/api/widget/" + AGENT_ID + "/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ contactId: contactId }, payload)),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setTyping(false);
        (data.messages || []).forEach(function (m) {
          addMessage("bot", m.text);
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
