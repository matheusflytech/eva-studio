"use client";

import * as React from "react";
import { MessageSquare, Music2, Check, Loader2, Unplug, Copy, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Conexão dos dois canais que não têm fluxo guiado de conexão: Messenger
// (a Meta só oferece Embedded Signup pro WhatsApp) e TikTok (o token sai do
// portal de desenvolvedor). Nos dois o usuário cola o que o painel deu.
// ---------------------------------------------------------------------------

interface MessengerStatus {
  connected: boolean;
  pageId: string;
  pageName: string;
}

export function MessengerConnect({ agentId }: { agentId: string }) {
  const [status, setStatus] = React.useState<MessengerStatus | null>(null);
  const [form, setForm] = React.useState({ pageId: "", pageAccessToken: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/messenger-connection`);
    if (res.ok) setStatus(await res.json());
  }, [agentId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function connect() {
    setBusy(true);
    setError(null);
    setWarning(null);
    const res = await fetch(`/api/agents/${agentId}/messenger-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível conectar.");
      return;
    }
    if (data.warning) setWarning(data.warning);
    setForm({ pageId: "", pageAccessToken: "" });
    refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`/api/agents/${agentId}/messenger-connection`, { method: "DELETE" });
    setBusy(false);
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare size={16} className="text-text-tertiary" /> Messenger
            </CardTitle>
            <CardDescription>
              Mensagens da sua Página do Facebook, pelo mesmo webhook já usado no WhatsApp e no Instagram.
            </CardDescription>
          </div>
          {status?.connected && <Badge variant="success">Conectado</Badge>}
        </div>
      </CardHeader>

      {status?.connected ? (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-medium text-text-primary">
              <Check size={15} className="text-emerald-400" /> {status.pageName || status.pageId}
            </div>
            <div className="mt-0.5 text-[12px] text-text-tertiary">Página {status.pageId}</div>
          </div>
          <Button variant="ghost" onClick={disconnect} disabled={busy} className="text-danger hover:bg-danger/10">
            <Unplug size={15} /> Desconectar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-1 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-text-secondary">
            <li>1. No painel da Meta, abra o produto Messenger do seu app.</li>
            <li>2. Gere um token de acesso da Página que o agente vai atender.</li>
            <li>3. Cole o ID da Página e esse token aqui.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="msgr-page">ID da Página</Label>
              <Input
                id="msgr-page"
                value={form.pageId}
                onChange={(e) => setForm({ ...form, pageId: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="msgr-token">Token de acesso da Página</Label>
              <Input
                id="msgr-token"
                value={form.pageAccessToken}
                onChange={(e) => setForm({ ...form, pageAccessToken: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          {warning && (
            <p className="inline-flex items-start gap-1.5 text-[13px] text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
            </p>
          )}
          <Button
            onClick={connect}
            disabled={busy || !form.pageId.trim() || !form.pageAccessToken.trim()}
            className="self-start"
          >
            {busy && <Loader2 size={15} className="animate-spin" />} Conectar
          </Button>
        </div>
      )}
    </Card>
  );
}

interface TikTokStatus {
  connected: boolean;
  businessId: string;
  displayName: string;
  expiresAt: string | null;
  lastError: string | null;
  webhookUrl: string;
}

export function TikTokConnect({ agentId }: { agentId: string }) {
  const [status, setStatus] = React.useState<TikTokStatus | null>(null);
  const [form, setForm] = React.useState({ businessId: "", accessToken: "", refreshToken: "", displayName: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/tiktok-connection`);
    if (res.ok) setStatus(await res.json());
  }, [agentId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/tiktok-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível conectar.");
      return;
    }
    setForm({ businessId: "", accessToken: "", refreshToken: "", displayName: "" });
    refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`/api/agents/${agentId}/tiktok-connection`, { method: "DELETE" });
    setBusy(false);
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Music2 size={16} className="text-text-tertiary" /> TikTok
            </CardTitle>
            <CardDescription>
              Mensagens diretas de uma conta TikTok Business, pela Business Messaging API.
            </CardDescription>
          </div>
          {status?.connected && <Badge variant="success">Conectado</Badge>}
        </div>
      </CardHeader>

      <p className="mb-3 inline-flex items-start gap-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-[12px] text-text-secondary">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
        Exige app aprovado no portal do TikTok, e a API não atende contas registradas no Espaço Econômico Europeu,
        Suíça e Reino Unido.
      </p>

      {status?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-medium text-text-primary">
                <Check size={15} className="text-emerald-400" /> {status.displayName || status.businessId}
              </div>
              <div className="mt-0.5 text-[12px] text-text-tertiary">
                {status.expiresAt
                  ? `Token expira em ${new Date(status.expiresAt).toLocaleString("pt-BR")} — renovado sozinho`
                  : "Sem data de expiração registrada"}
              </div>
            </div>
            <Button variant="ghost" onClick={disconnect} disabled={busy} className="text-danger hover:bg-danger/10">
              <Unplug size={15} /> Desconectar
            </Button>
          </div>
          {status.lastError && <p className="text-[13px] text-danger">{status.lastError}</p>}
          <div>
            <Label>URL de callback (cole no portal do TikTok)</Label>
            <div className="flex gap-2">
              <Input readOnly value={status.webhookUrl} className="font-mono text-[12px]" />
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(status.webhookUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy size={15} /> {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tt-biz">Business ID</Label>
              <Input
                id="tt-biz"
                value={form.businessId}
                onChange={(e) => setForm({ ...form, businessId: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tt-name">Nome da conta (opcional)</Label>
              <Input
                id="tt-name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tt-token">Access token</Label>
              <Input
                id="tt-token"
                value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="tt-refresh">Refresh token</Label>
              <Input
                id="tt-refresh"
                value={form.refreshToken}
                onChange={(e) => setForm({ ...form, refreshToken: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-[11.5px] text-text-tertiary">
            O access token do TikTok dura cerca de 24h. Com o refresh token preenchido, o app renova sozinho antes
            de cada envio; sem ele, a conexão para de funcionar no dia seguinte.
          </p>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button
            onClick={connect}
            disabled={busy || !form.businessId.trim() || !form.accessToken.trim()}
            className="self-start"
          >
            {busy && <Loader2 size={15} className="animate-spin" />} Conectar
          </Button>
        </div>
      )}
    </Card>
  );
}
