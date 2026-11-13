"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Download, MessageSquare } from "lucide-react";
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
                {!d.motivo && d.situacao === "fila" && <p className="text-caption text-text-tertiary">Sai no ritmo do chip (limite diário)</p>}
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
