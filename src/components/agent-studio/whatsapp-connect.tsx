"use client";

import * as React from "react";
import { Loader2, Smartphone, QrCode, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectionState {
  status: "disconnected" | "requesting" | "qr_pending" | "connected" | "logging_out";
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
}

export function WhatsAppConnect({ agentId }: { agentId: string }) {
  const [state, setState] = React.useState<ConnectionState | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = React.useCallback(async () => {
    const res = await fetch(`/api/whatsapp/${agentId}`);
    if (!res.ok) return;
    const data = await res.json();
    setState(data.connection);
  }, [agentId]);

  React.useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  async function handleConnect() {
    await fetch(`/api/whatsapp/${agentId}`, { method: "POST" });
    fetchStatus();
  }

  async function handleDisconnect() {
    await fetch(`/api/whatsapp/${agentId}`, { method: "DELETE" });
    fetchStatus();
  }

  if (!state) return null;

  return (
    <div className="flex flex-col gap-3">
      {state.status === "disconnected" && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-raised px-4 py-3">
          <div className="flex items-center gap-2.5 text-text-secondary">
            <Smartphone size={16} />
            <span className="text-small">Nenhum WhatsApp conectado a este agente.</span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleConnect}>
            <QrCode size={14} /> Conectar via QR code
          </Button>
        </div>
      )}

      {(state.status === "requesting" || (state.status === "qr_pending" && !state.qrDataUrl)) && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-raised px-4 py-3 text-small text-text-secondary">
          <Loader2 size={15} className="animate-spin" /> Gerando QR code…
        </div>
      )}

      {state.status === "qr_pending" && state.qrDataUrl && (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border-subtle bg-raised p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qrDataUrl} alt="QR code do WhatsApp" className="h-48 w-48 rounded-lg bg-white p-2" />
          <p className="max-w-xs text-center text-small text-text-tertiary">
            No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho. Escaneie este código.
          </p>
        </div>
      )}

      {state.status === "connected" && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-raised px-4 py-3">
          <div className="flex items-center gap-2.5 text-text-primary">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-small font-medium">Conectado{state.phoneNumber ? ` — ${state.phoneNumber}` : ""}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect}>
            Desconectar
          </Button>
        </div>
      )}

      {state.status === "logging_out" && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-raised px-4 py-3 text-small text-text-secondary">
          <Loader2 size={15} className="animate-spin" /> Desconectando…
        </div>
      )}

      {state.lastError && state.status !== "connected" && (
        <div className="flex items-center gap-2 text-caption text-danger">
          <XCircle size={13} /> {state.lastError}
        </div>
      )}

      <p className="text-caption text-text-tertiary">
        Conexão direta via QR code (não é a API oficial da Meta) — boa pra validar rápido, mas não é o método
        recomendado pra alto volume. Requer o worker de WhatsApp rodando.
      </p>
    </div>
  );
}
