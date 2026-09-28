"use client";

import * as React from "react";
import { Send, Check, Loader2, Unplug, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Status {
  connected: boolean;
  botUsername: string;
  webhookSet: boolean;
  lastError: string | null;
  webhookUrl: string;
}

/**
 * Conexão com o Telegram: cola o token do @BotFather e pronto.
 *
 * É o único canal do app que não depende de aprovação de ninguém — sem App
 * Review da Meta, sem verificação de negócio, sem modelo de mensagem. Por
 * isso também é o caminho mais rápido pra testar um fluxo num aplicativo de
 * mensagem de verdade enquanto o WhatsApp oficial ainda está em análise.
 */
export function TelegramConnect({ agentId }: { agentId: string }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/telegram-connection`);
    if (res.ok) setStatus(await res.json());
  }, [agentId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/telegram-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível conectar.");
      return;
    }
    setToken("");
    if (data.error) setError(data.error);
    refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`/api/agents/${agentId}/telegram-connection`, { method: "DELETE" });
    setBusy(false);
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send size={16} className="text-text-tertiary" /> Telegram
            </CardTitle>
            <CardDescription>
              Canal sem aprovação: crie um bot no @BotFather, cole o token e o agente já responde.
            </CardDescription>
          </div>
          {status?.connected && (
            <Badge variant={status.webhookSet ? "success" : "danger"}>
              {status.webhookSet ? "Conectado" : "Webhook falhou"}
            </Badge>
          )}
        </div>
      </CardHeader>

      {status?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-medium text-text-primary">
                <Check size={15} className="text-emerald-400" />
                @{status.botUsername || "bot"}
              </div>
              <div className="mt-0.5 text-[12px] text-text-tertiary">
                {status.webhookSet
                  ? "O Telegram está entregando as mensagens no app."
                  : status.lastError ?? "O webhook não foi registrado."}
              </div>
            </div>
            <Button variant="ghost" onClick={disconnect} disabled={busy} className="text-danger hover:bg-danger/10">
              <Unplug size={15} /> Desconectar
            </Button>
          </div>

          {status.botUsername && (
            <a
              href={`https://t.me/${status.botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-[13px] text-accent-400 hover:underline"
            >
              Abrir conversa com o bot <ExternalLink size={13} />
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-1 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-text-secondary">
            <li>1. No Telegram, fale com <span className="text-text-primary">@BotFather</span> e mande /newbot.</li>
            <li>2. Escolha um nome e um usuário para o bot.</li>
            <li>3. Copie o token que ele devolve e cole aqui.</li>
          </ol>
          <div>
            <Label htmlFor="tg-token">Token do bot</Label>
            <Input
              id="tg-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAE..."
              autoComplete="off"
            />
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button onClick={connect} disabled={busy || !token.trim()} className="self-start">
            {busy && <Loader2 size={15} className="animate-spin" />} Conectar
          </Button>
        </div>
      )}
    </Card>
  );
}
