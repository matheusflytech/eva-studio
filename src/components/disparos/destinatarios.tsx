"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Download, MessageSquare, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROTULO_DA_SITUACAO, type Situacao } from "@/lib/disparos/situacao";
import { cn } from "@/lib/utils";

// Quem recebeu e quem não recebeu um disparo: filtro por situação, motivo da
// falha, exportar (CSV) e abrir a conversa de cada um.

interface Destinatario {
  id: string;
  numero: string;
  situacao: Situacao;
  motivo: string | null;
  respondeu: boolean;
  conversationId: string | null;
}

interface Resposta {
  contagem: Record<Situacao, number>;
  total: number;
  truncado: boolean;
  destinatarios: Destinatario[];
}

const ORDEM: Situacao[] = ["falhou", "fila", "enviado", "entregue", "lido"];
const VARIANTE: Record<Situacao, "danger" | "neutral" | "info" | "success"> = {
  falhou: "danger",
  fila: "neutral",
  enviando: "info",
  enviado: "info",
  entregue: "success",
  lido: "success",
};
const POR_PAGINA = 100;

export function Destinatarios({ agentId, broadcastId }: { agentId: string; broadcastId: string }) {
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [filtro, setFiltro] = React.useState<Situacao | null>(null);
  const [mostrar, setMostrar] = React.useState(POR_PAGINA);
  const [erro, setErro] = React.useState<string | null>(null);
  const base = `/api/agents/${agentId}/broadcasts/${broadcastId}/recipients`;

  React.useEffect(() => {
    let vivo = true;
    async function carregar() {
      try {
        const r = await fetch(base, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não consegui carregar os destinatários.");
        if (vivo) setDados(j);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não consegui carregar os destinatários.");
      }
    }
    void carregar();
    const t = setInterval(() => document.visibilityState === "visible" && void carregar(), 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [base]);

  if (erro) return <p className="text-small text-danger">{erro}</p>;
  if (!dados) return <p className="text-small text-text-tertiary">Carregando destinatários…</p>;

  const lista = filtro ? dados.destinatarios.filter((d) => d.situacao === filtro) : dados.destinatarios;
  const exportar = `${base}?format=csv${filtro ? `&status=${filtro}` : ""}`;

  return (
    <section className="flex flex-col gap-3" aria-label="Destinatários">
      <div className="flex items-center gap-2">
        <p className="font-mono text-caption text-text-tertiary">Destinatários ({dados.total})</p>
        <button
          type="button"
          onClick={() => void baixar(exportar)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1.5 text-small font-medium text-text-primary hover:bg-hover"
        >
          <Download size={14} aria-hidden /> Exportar {filtro ? ROTULO_DA_SITUACAO[filtro].toLowerCase() : "todos"}
        </button>
      </div>

      {dados.contagem.falhou > 0 && <Reenviar agentId={agentId} broadcastId={broadcastId} />}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
        <Filtro ativo={!filtro} onClick={() => setFiltro(null)}>Todos {dados.total}</Filtro>
        {ORDEM.filter((s) => dados.contagem[s] > 0).map((s) => (
          <Filtro key={s} ativo={filtro === s} onClick={() => { setFiltro(s); setMostrar(POR_PAGINA); }}>
            {ROTULO_DA_SITUACAO[s]} {dados.contagem[s]}
          </Filtro>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-small text-text-tertiary">Ninguém nesta situação.</p>
      ) : (
        <ul className="flex flex-col">
          {lista.slice(0, mostrar).map((d) => (
            <li key={d.id} className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-small text-text-primary">{d.numero}</p>
                {d.motivo && <p className="truncate text-caption text-danger">{d.motivo}</p>}
                {!d.motivo && d.situacao === "fila" && <p className="text-caption text-text-tertiary">Aguardando a vez de sair</p>}
              </div>
              {d.respondeu && <Badge variant="accent">Respondeu</Badge>}
              <Badge variant={VARIANTE[d.situacao]}>{ROTULO_DA_SITUACAO[d.situacao]}</Badge>
              {d.conversationId ? (
                <Link
                  href={`/conversations?c=${d.conversationId}`}
                  aria-label={`Abrir conversa com ${d.numero}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-hover hover:text-text-primary"
                >
                  <MessageSquare size={16} />
                </Link>
              ) : (
                <span className="h-9 w-9 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
      {lista.length > mostrar && (
        <button type="button" onClick={() => setMostrar((m) => m + POR_PAGINA)} className="self-center text-small font-medium text-accent-fg">
          Mostrar mais ({lista.length - mostrar})
        </button>
      )}
      {dados.truncado && <p className="text-caption text-text-tertiary">Mostrando os primeiros 10.000. O CSV traz o mesmo recorte.</p>}
    </section>
  );
}

interface Chip {
  agentId: string | null;
  numero: string | null;
  agente: string | null;
  sessao: string;
}

// Quem não chegou (ex.: o chip caiu) sai de novo por outro chip conectado.
// O servidor tira quem já recebeu em qualquer disparo: ninguém recebe duas vezes.
function Reenviar({ agentId, broadcastId }: { agentId: string; broadcastId: string }) {
  const [chips, setChips] = React.useState<Chip[] | null>(null);
  const [alvo, setAlvo] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null);

  React.useEffect(() => {
    fetch("/api/chips", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const conectados = ((j.chips ?? []) as Chip[]).filter((c) => c.agentId && c.sessao === "connected");
        setChips(conectados);
        setAlvo(conectados.find((c) => c.agentId !== agentId)?.agentId ?? conectados[0]?.agentId ?? "");
      })
      .catch(() => setChips([]));
  }, [agentId]);

  async function reenviar() {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/agents/${agentId}/broadcasts/${broadcastId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAgentId: alvo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não consegui reenviar.");
      const partes = [`${j.reenviados} na fila do novo chip`];
      if (j.jaReceberam) partes.push(`${j.jaReceberam} já tinham recebido`);
      if (j.semWhatsApp) partes.push(`${j.semWhatsApp} sem WhatsApp`);
      setAviso({ ok: true, texto: j.reenviados ? `Reenvio criado: ${partes.join(", ")}.` : `Nada para reenviar: ${partes.slice(1).join(", ") || "ninguém pendente"}.` });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "Não consegui reenviar." });
    } finally {
      setEnviando(false);
    }
  }

  if (!chips) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-raised p-3">
      <p className="text-small text-text-primary">
        <strong>Reenviar quem não chegou</strong> por outro chip. Quem já recebeu (em qualquer disparo) fica de fora.
      </p>
      {chips.length === 0 ? (
        <p className="text-caption text-text-tertiary">Nenhum chip conectado agora. Conecte outro chip em Chips e volte aqui.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`reenvio-${broadcastId}`}>Chip que vai reenviar</label>
          <select
            id={`reenvio-${broadcastId}`}
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            className="h-9 rounded-lg border border-border-default bg-bg-base px-2 text-small text-text-primary"
          >
            {chips.map((c) => (
              <option key={c.agentId} value={c.agentId!}>
                {c.numero ?? c.agente ?? "Chip"}{c.agentId === agentId ? " (o mesmo)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void reenviar()}
            disabled={enviando || !alvo}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-text-primary px-4 text-small font-medium text-bg-base disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden /> {enviando ? "Reenviando…" : "Reenviar"}
          </button>
        </div>
      )}
      {aviso && <p role="status" className={cn("text-caption", aviso.ok ? "text-text-secondary" : "text-danger")}>{aviso.texto}</p>}
    </div>
  );
}

// fetch (e não um link): leva o contrato da aba no cabeçalho, como toda chamada do app.
async function baixar(url: string) {
  const r = await fetch(url);
  if (!r.ok) return;
  const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "disparo.csv";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob());
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full px-3 py-1.5 text-small transition-colors",
        ativo ? "bg-text-primary text-bg-base" : "bg-raised text-text-secondary hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}
