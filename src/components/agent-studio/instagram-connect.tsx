"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CheckCircle2, AtSign, ExternalLink, Lock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Label } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

interface Connection {
  igBusinessId: string;
  username: string | null;
}

const INSTAGRAM_APP_ID = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;

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

  // Passa pela rota server-side, que valida sessão/posse do agente e cria o
  // nonce anti-CSRF (state) num cookie httpOnly antes de ir pra Meta.
  const authorizeUrl = INSTAGRAM_APP_ID ? `/api/instagram/oauth/start?agentId=${encodeURIComponent(agentId)}` : null;

  return (
    <div className="flex flex-col gap-3">
      {authorizeUrl ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2.5 text-text-secondary">
              <AtSign size={16} />
              <span className="text-[13px]">Nenhuma conta Instagram conectada a este agente.</span>
            </div>
            <a href={authorizeUrl} className={buttonVariants({ variant: "solid", size: "sm" })}>
              Conectar com Instagram
            </a>
          </div>
          <p className="text-[11.5px] text-text-tertiary">
            Abre o Instagram numa aba, você escolhe a conta profissional e volta pra cá. Nenhuma senha passa
            pelo Eva Studio.
          </p>
        </>
      ) : (
        // Sem app da Meta configurado não existe login pra oferecer. Dizer isso
        // com todas as letras, e dizer de quem é a tarefa, vale mais que um
        // formulário de token que a pessoa não tem como preencher.
        <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Lock size={16} className="mt-0.5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-text-primary">
                O login com Instagram ainda não foi ligado nesta instalação.
              </p>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Conectar uma conta exige um app da Meta, criado uma vez por quem administra o Eva Studio — não
                é por cliente e não é por agente. Enquanto ele não existir, este botão não tem para onde levar
                ninguém.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-surface-3 px-3.5 py-3">
            <p className="text-[11.5px] font-medium text-text-secondary">Falta configurar na Vercel:</p>
            <ul className="mt-1.5 flex flex-col gap-1 font-mono text-[11.5px] text-text-tertiary">
              <li>INSTAGRAM_APP_ID</li>
              <li>INSTAGRAM_APP_SECRET</li>
              <li>NEXT_PUBLIC_INSTAGRAM_APP_ID</li>
            </ul>
            <a
              href="/meta-business-runbook.html"
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-400 hover:text-accent-300"
            >
              Passo a passo pra criar o app <ExternalLink size={12} />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex items-center gap-1.5 self-start text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <ChevronDown size={12} className={cn("transition-transform", !showManualForm && "-rotate-90")} />
            Já tenho o token no painel da Meta
          </button>
        </div>
      )}

      {searchParams.get("instagram_error") && (
        <p className="text-[12px] text-danger">Falha ao conectar ({searchParams.get("instagram_error")}). Tenta de novo.</p>
      )}

      {showManualForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-3.5">
          <p className="text-[11.5px] text-text-tertiary">
            Caminho de quem já tem o app da Meta pronto: os dois valores saem do painel do app, em
            Instagram &gt; Configuração da API.
          </p>
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
