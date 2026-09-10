"use client";

import * as React from "react";
import Script from "next/script";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;

// Embedded Signup oficial da Meta pro WhatsApp — o cliente clica, faz login
// com a própria conta Business dele (não a nossa), escolhe/cria a WABA, e a
// Meta devolve um "code" que trocamos por um token de verdade (ver
// /api/agents/[agentId]/meta-connection). Só aparece funcional quando o app
// Meta já existir (NEXT_PUBLIC_META_APP_ID/CONFIG_ID configurados) — ver
// docs/meta-business-runbook.html pros pré-requisitos.
export function MetaWhatsAppConnect({ agentId }: { agentId: string }) {
  const [sdkReady, setSdkReady] = React.useState(false);
  const [status, setStatus] = React.useState<{ configured: boolean; connection: { phoneNumberId: string; displayPhone: string | null } | null } | null>(null);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pendingIdsRef = React.useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  React.useEffect(() => {
    fetch(`/api/agents/${agentId}/meta-connection`)
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connection: null }));
  }, [agentId]);

  React.useEffect(() => {
    if (!APP_ID) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") {
          pendingIdsRef.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        }
      } catch {
        // mensagens de outras origens/formatos — ignora
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleConnect() {
    if (!window.FB || !CONFIG_ID) return;
    setIsConnecting(true);
    setError(null);
    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        const { wabaId, phoneNumberId } = pendingIdsRef.current;
        if (!code || !wabaId || !phoneNumberId) {
          setError("Conexão cancelada ou incompleta.");
          setIsConnecting(false);
          return;
        }
        try {
          const res = await fetch(`/api/agents/${agentId}/meta-connection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, wabaId, phoneNumberId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
          setStatus({ configured: true, connection: { phoneNumberId, displayPhone: null } });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erro inesperado.");
        } finally {
          setIsConnecting(false);
        }
      },
      { config_id: CONFIG_ID, response_type: "code", override_default_response_type: true }
    );
  }

  async function handleDisconnect() {
    await fetch(`/api/agents/${agentId}/meta-connection`, { method: "DELETE" });
    setStatus((s) => (s ? { ...s, connection: null } : s));
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <p className="rounded-2xl border border-border-default bg-surface-2 px-4 py-3 text-[12.5px] text-text-tertiary">
        Canal oficial ainda não configurado neste ambiente — falta criar o app Meta e uma configuração de Embedded
        Signup (variáveis <code className="font-mono">NEXT_PUBLIC_META_APP_ID</code> /{" "}
        <code className="font-mono">NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID</code>). Veja o passo a passo no runbook.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.fbAsyncInit = () => {
            window.FB?.init({ appId: APP_ID, version: "v21.0" });
            setSdkReady(true);
          };
          window.fbAsyncInit();
        }}
      />

      {status?.connection ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2.5 text-text-primary">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-[13px] font-medium">
              Conectado{status.connection.displayPhone ? ` — ${status.connection.displayPhone}` : ""}
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect}>
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2.5 text-text-secondary">
            <ShieldCheck size={16} />
            <span className="text-[13px]">Nenhum número oficial conectado a este agente.</span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleConnect} disabled={!sdkReady || isConnecting}>
            {isConnecting ? "Conectando..." : "Conectar com a Meta"}
          </Button>
        </div>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}

      <p className="text-[11.5px] text-text-tertiary">
        Login oficial da Meta (Embedded Signup) — o cliente entra com a própria conta Business dele, sem precisar
        de acesso manual à WABA por parte do time. Requer App Review aprovado pra funcionar fora do modo de teste
        (ver runbook).
      </p>
    </div>
  );
}
