"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CheckCircle2, AtSign } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

interface Connection {
  igBusinessId: string;
  username: string | null;
}

const INSTAGRAM_APP_ID = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
const INSTAGRAM_SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";

export function InstagramConnect({ agentId }: { agentId: string }) {
  const [connection, setConnection] = React.useState<Connection | null | undefined>(undefined);
  const [igBusinessId, setIgBusinessId] = React.useState("");
  const [pageAccessToken, setPageAccessToken] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showManualForm, setShowManualForm] = React.useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const load = React.useCallback(() => {
    fetch(`/api/agents/${agentId}/instagram-connection`)
      .then((res) => res.json())
      .then((data) => setConnection(data.connection))
      .catch(() => setConnection(null));
  }, [agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Volta do redirect do Instagram Login (sucesso ou erro) — recarrega o
  // status e limpa a query string pra não ficar reprocessando no reload.
  React.useEffect(() => {
    if (!searchParams.has("instagram") && !searchParams.has("instagram_error")) return;
    load();
    router.replace(pathname);
  }, [searchParams, load, router, pathname]);

  async function handleSave() {
    if (!igBusinessId.trim() || !pageAccessToken.trim()) {
      setError("Preencha o id da conta e o token de acesso.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/instagram-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igBusinessId, pageAccessToken, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
      setConnection({ igBusinessId, username: username || null });
      setPageAccessToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    await fetch(`/api/agents/${agentId}/instagram-connection`, { method: "DELETE" });
    setConnection(null);
  }

  if (connection === undefined) return null;

  if (connection) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2.5 text-text-primary">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-[13px] font-medium">Conectado{connection.username ? ` — @${connection.username}` : ""}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect}>
          Desconectar
        </Button>
      </div>
    );
  }

  const authorizeUrl =
    INSTAGRAM_APP_ID && typeof window !== "undefined"
      ? `https://www.instagram.com/oauth/authorize?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(
          `${window.location.origin}/api/instagram/oauth/callback`
        )}&scope=${INSTAGRAM_SCOPES}&response_type=code&state=${agentId}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2.5 text-text-secondary">
          <AtSign size={16} />
          <span className="text-[13px]">Nenhuma conta Instagram conectada a este agente.</span>
        </div>
        {authorizeUrl ? (
          <a href={authorizeUrl} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Continuar com Instagram
          </a>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowManualForm((v) => !v)}>
            Conectar manualmente
          </Button>
        )}
      </div>

      {searchParams.get("instagram_error") && (
        <p className="text-[12px] text-danger">Falha ao conectar ({searchParams.get("instagram_error")}). Tenta de novo.</p>
      )}

      {!authorizeUrl && (
        <p className="text-[11.5px] text-text-tertiary">
          Login oficial (Instagram Login) ainda não configurado neste ambiente — falta{" "}
          <code className="font-mono">NEXT_PUBLIC_INSTAGRAM_APP_ID</code>. Até lá, conecte manualmente com os
          valores obtidos no painel do app Meta (ver runbook).
        </p>
      )}

      {(showManualForm || !authorizeUrl) && (
        <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-3.5">
          <div>
            <Label htmlFor="ig-business-id">Id da conta Instagram Business</Label>
            <Input id="ig-business-id" className="font-mono text-[12.5px]" value={igBusinessId} onChange={(e) => setIgBusinessId(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ig-token">Token de acesso</Label>
            <Input id="ig-token" type="password" className="font-mono text-[12.5px]" value={pageAccessToken} onChange={(e) => setPageAccessToken(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ig-username">@usuário (opcional, só pra exibição)</Label>
            <Input id="ig-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Conectar"}
          </Button>
        </div>
      )}
    </div>
  );
}
