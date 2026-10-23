"use client";

import * as React from "react";
import Script from "next/script";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useContrato } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import type { TipoDeCanal } from "@/lib/canais";

// ---------------------------------------------------------------------------
// Formulários de conexão de canal no CONTRATO (Configurações → Canais).
// Nenhum pede agente: o canal nasce sem agente e cada agente escolhe o seu
// na aba Canais dele. Mesmas validações da conexão por agente (servidor em
// src/lib/server/canais/conectar.ts).
// ---------------------------------------------------------------------------

type AoConectar = (aviso?: string | null) => void;

async function postar(tipo: TipoDeCanal, corpo: Record<string, unknown>) {
  const res = await fetch(`/api/canais/conectar/${tipo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Não deu para conectar.");
  return data as { canalId: string; aviso: string | null; webhookUrl: string | null };
}

function useEnvio() {
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  async function enviar<T>(fn: () => Promise<T>): Promise<T | null> {
    setEnviando(true);
    setErro(null);
    try {
      return await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para conectar.");
      return null;
    } finally {
      setEnviando(false);
    }
  }
  return { enviando, erro, enviar };
}

export function ConectarCanal({ tipo, aoConectar }: { tipo: TipoDeCanal; aoConectar: AoConectar }) {
  switch (tipo) {
    case "telegram":
      return <ConectarTelegram aoConectar={aoConectar} />;
    case "messenger":
      return <ConectarMessenger aoConectar={aoConectar} />;
    case "tiktok":
      return <ConectarTikTok aoConectar={aoConectar} />;
    case "instagram":
      return <ConectarInstagram />;
    case "whatsapp_meta":
      return <ConectarWhatsAppOficial aoConectar={aoConectar} />;
    case "whatsapp_qr":
      return <ConectarWhatsAppQr aoConectar={aoConectar} />;
  }
}

function ConectarTelegram({ aoConectar }: { aoConectar: AoConectar }) {
  const [token, setToken] = React.useState("");
  const { enviando, erro, enviar } = useEnvio();
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-0.5 pl-5 text-small text-text-secondary">
        <li>No Telegram, fale com @BotFather e mande /newbot.</li>
        <li>Escolha um nome e um usuário para o bot.</li>
        <li>Copie o token que ele devolve e cole aqui.</li>
      </ol>
      <div>
        <Label htmlFor="tg-token">Token do bot</Label>
        <Input id="tg-token" placeholder="123456789:AAE..." value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-caption" />
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div>
        <Button type="button" disabled={enviando || !token.trim()} onClick={async () => {
          const r = await enviar(() => postar("telegram", { botToken: token.trim() }));
          if (r) aoConectar(r.aviso);
        }}>
          {enviando ? "Conectando..." : "Conectar bot"}
        </Button>
      </div>
    </div>
  );
}

function ConectarMessenger({ aoConectar }: { aoConectar: AoConectar }) {
  const [pageId, setPageId] = React.useState("");
  const [token, setToken] = React.useState("");
  const { enviando, erro, enviar } = useEnvio();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="fb-page">ID da Página</Label>
          <Input id="fb-page" value={pageId} onChange={(e) => setPageId(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="fb-token">Token de acesso da Página</Label>
          <Input id="fb-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-caption" />
        </div>
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div>
        <Button type="button" disabled={enviando || !pageId.trim() || !token.trim()} onClick={async () => {
          const r = await enviar(() => postar("messenger", { pageId: pageId.trim(), pageAccessToken: token.trim() }));
          if (r) aoConectar(r.aviso);
        }}>
          {enviando ? "Conectando..." : "Conectar Página"}
        </Button>
      </div>
    </div>
  );
}

function ConectarTikTok({ aoConectar }: { aoConectar: AoConectar }) {
  const [f, setF] = React.useState({ businessId: "", accessToken: "", refreshToken: "", expiresIn: "", displayName: "" });
  const [webhook, setWebhook] = React.useState<string | null>(null);
  const { enviando, erro, enviar } = useEnvio();
  const campo = (k: keyof typeof f, rotulo: string, segredo = false) => (
    <div>
      <Label htmlFor={`tt-${k}`}>{rotulo}</Label>
      <Input id={`tt-${k}`} type={segredo ? "password" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  if (webhook) {
    return (
      <div className="flex flex-col gap-2">
        <Notice tone="info">Conta salva. Cole esta URL como callback de mensagens no portal do TikTok:</Notice>
        <code className="break-all rounded-lg bg-hover px-3 py-2 font-mono text-caption text-text-primary">{webhook}</code>
        <div>
          <Button type="button" variant="secondary" onClick={() => aoConectar(null)}>Pronto</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("businessId", "Business ID")}
        {campo("displayName", "Nome da conta (opcional)")}
        {campo("accessToken", "Access token", true)}
        {campo("refreshToken", "Refresh token (opcional)", true)}
        {campo("expiresIn", "Validade do token em segundos (opcional)")}
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div>
        <Button type="button" disabled={enviando || !f.businessId.trim() || !f.accessToken.trim()} onClick={async () => {
          const r = await enviar(() => postar("tiktok", { ...f, expiresIn: Number(f.expiresIn || 0) }));
          if (r?.webhookUrl) setWebhook(r.webhookUrl);
          else if (r) aoConectar(r.aviso);
        }}>
          {enviando ? "Conectando..." : "Conectar conta"}
        </Button>
      </div>
    </div>
  );
}

function ConectarInstagram() {
  const contrato = useContrato();
  const configurado = !!process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  if (!configurado) {
    return <Notice tone="warning">O app do Instagram ainda não foi configurado neste ambiente (NEXT_PUBLIC_INSTAGRAM_APP_ID).</Notice>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-text-secondary">
        Abre o Instagram, você escolhe a conta profissional e volta para cá. Nenhuma senha passa pelo Eva Studio.
      </p>
      <div>
        {/* Navegação de página inteira: o servidor guarda o state anti-CSRF num cookie. */}
        <a href={apiDoContrato(contrato, "/api/instagram/oauth/start?modo=contrato")} className={buttonVariants({ variant: "primary" })}>
          Conectar com Instagram
        </a>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: { config_id: string; response_type: string; override_default_response_type: boolean }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;

// Embedded Signup da Meta: o cliente entra com a conta Business DELE, escolhe
// ou cria a WABA e o número; a Meta devolve um code que o servidor troca por
// token. Mesmo fluxo de meta-whatsapp-connect.tsx, gravando no contrato.
function ConectarWhatsAppOficial({ aoConectar }: { aoConectar: AoConectar }) {
  const [pronto, setPronto] = React.useState(false);
  const ids = React.useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const { enviando, erro, enviar } = useEnvio();

  React.useEffect(() => {
    if (!META_APP_ID) return;
    function aoReceber(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") {
          ids.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        }
      } catch {
        // Mensagens de outros formatos: ignora.
      }
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  if (!META_APP_ID || !META_CONFIG_ID) {
    return (
      <Notice tone="warning">
        O WhatsApp oficial ainda não foi configurado neste ambiente: falta o app da Meta e a configuração do Embedded
        Signup (NEXT_PUBLIC_META_APP_ID / NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID). Veja o runbook da Meta.
      </Notice>
    );
  }

  function entrar() {
    if (!window.FB || !META_CONFIG_ID) return;
    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        const { wabaId, phoneNumberId } = ids.current;
        if (!code || !wabaId || !phoneNumberId) return;
        const r = await enviar(() => postar("whatsapp_meta", { code, wabaId, phoneNumberId }));
        if (r) aoConectar(r.aviso);
      },
      { config_id: META_CONFIG_ID, response_type: "code", override_default_response_type: true }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.fbAsyncInit = () => {
            window.FB?.init({ appId: META_APP_ID, version: "v21.0" });
            setPronto(true);
          };
          window.fbAsyncInit();
        }}
      />
      <p className="text-small text-text-secondary">Entre com a conta Business da empresa (BM), escolha o número e volte.</p>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div>
        <Button type="button" disabled={!pronto || enviando} onClick={entrar}>
          {enviando ? "Conectando..." : "Entrar com a Meta"}
        </Button>
      </div>
    </div>
  );
}

interface EstadoDoQr {
  status: "disconnected" | "requesting" | "qr_pending" | "connected" | "logging_out";
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  /** Quando o worker mexeu na sessão pela última vez. */
  atualizadoEm?: string | null;
  /** Há quanto tempo o worker não mexe na sessão, medido pelo servidor. */
  idadeMs?: number | null;
  /** Calculado na leitura: esperando QR sem mudança há tempo demais. */
  parado?: boolean;
}

// Um worker vivo troca o QR a cada ~20 s e reabre a sessão a cada ~2 min.
// Sem mudança há mais que isso, o QR na tela já não vale: o worker parou.
const WORKER_PARADO_MS = 3 * 60_000;

// QR: cria o canal, o worker abre a sessão e devolve o QR; a tela lê a cada
// 3 s até conectar.
export function ConectarWhatsAppQr({ aoConectar, canalInicial = null }: { aoConectar: AoConectar; canalInicial?: string | null }) {
  // canalInicial: canal de QR que ficou pendente (a pessoa volta para ler o QR).
  const [canalId, setCanalId] = React.useState<string | null>(canalInicial);
  const [estado, setEstado] = React.useState<EstadoDoQr | null>(null);
  const { enviando, erro, enviar } = useEnvio();

  React.useEffect(() => {
    if (!canalId) return;
    let vivo = true;
    const ler = () =>
      fetch(`/api/canais/${canalId}/qr`)
        .then((r) => r.json())
        .then((d) => {
          if (!vivo || !d?.connection) return;
          const c = d.connection as EstadoDoQr;
          const esperando = c.status === "requesting" || c.status === "qr_pending";
          setEstado({ ...c, parado: esperando && typeof c.idadeMs === "number" && c.idadeMs > WORKER_PARADO_MS });
        })
        .catch(() => {});
    void ler();
    const t = setInterval(ler, 3000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [canalId]);

  React.useEffect(() => {
    if (estado?.status === "connected") aoConectar(null);
  }, [estado?.status, aoConectar]);

  if (!canalId) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-text-secondary">
          Bom para testar; para volume alto prefira o oficial. Precisa do worker do WhatsApp ligado.
        </p>
        {erro && <Notice tone="danger">{erro}</Notice>}
        <div>
          <Button type="button" disabled={enviando} onClick={async () => {
            const r = await enviar(() => postar("whatsapp_qr", {}));
            if (r) setCanalId(r.canalId);
          }}>
            <QrCode size={15} /> {enviando ? "Preparando..." : "Gerar QR code"}
          </Button>
        </div>
      </div>
    );
  }

  if (estado?.parado) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="warning">
          O worker do WhatsApp não responde desde {new Date(estado!.atualizadoEm!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. O QR que ele
          deixou já não vale (o celular diria “não é possível conectar”). Ligue o worker e gere outro QR.
        </Notice>
        <Button type="button" variant="secondary" size="sm" onClick={() => void fetch(`/api/canais/${canalId}/qr`, { method: "POST" })}>
          <RefreshCw size={14} /> Gerar outro QR
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {estado?.qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={estado.qrDataUrl} alt="QR code do WhatsApp" width={220} height={220} className="rounded-[12px] bg-white p-2" /* QR precisa de fundo branco para o celular ler */ />
      ) : (
        <p className="flex items-center gap-2 text-small text-text-secondary">
          <Loader2 size={14} className="animate-spin" /> Esperando o worker gerar o QR...
        </p>
      )}
      <p className="text-caption text-text-tertiary">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
      {estado?.lastError && <Notice tone="warning">{estado.lastError}</Notice>}
      <Button type="button" variant="ghost" size="sm" onClick={() => void fetch(`/api/canais/${canalId}/qr`, { method: "POST" })}>
        <RefreshCw size={14} /> Gerar outro QR
      </Button>
    </div>
  );
}
