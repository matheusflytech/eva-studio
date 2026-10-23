"use client";

import * as React from "react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import { cn } from "@/lib/utils";

export interface UsoDaChave {
  credentialId: string;
  nome: string;
  tipo: string;
  tokens: number;
  chamadas: number;
  falhas: number;
  limiteMensalTokens: number | null;
  precoMilhaoBrl: number | null;
  custoBrl: number | null;
  nivel: "sem_limite" | "ok" | "alerta" | "estourado";
  pct: number | null;
}

export interface ResumoDoUso {
  disponivel: boolean;
  chaves: UsoDaChave[];
  agentes: { agentId: string | null; nome: string; tokens: number; chamadas: number }[];
  plataforma: { tokens: number; chamadas: number };
}

export const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const rotuloDoTipo = (t: string) => LLM_PROVIDERS.find((p) => p.credentialType === t)?.label ?? t;

const COR_DA_BARRA: Record<UsoDaChave["nivel"], string> = {
  sem_limite: "bg-accent-solid",
  ok: "bg-success",
  alerta: "bg-warning",
  estourado: "bg-danger",
};

// Uso de IA do mês por chave (e por agente), com limite mensal em tokens e
// custo estimado pelo preço que o cliente informa. Chave que estoura o
// limite sai da fila da Central de IA até virar o mês; a reserva assume.
// v5: os números do mês ficam no topo de Integrações → IA; limite, preço e
// custo por chave aparecem ao abrir a chave; "por agente" mora no "…".

/** Lê o uso do mês. `recarregar` depois de salvar um limite. */
export function useUsoDaIa() {
  const [resumo, setResumo] = React.useState<ResumoDoUso | null>(null);
  const [versao, setVersao] = React.useState(0);
  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/ia/uso")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo && d && Array.isArray(d.chaves)) setResumo(d);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);
  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);
  return { resumo, recarregar };
}

/** Barra do limite mensal (só aparece quando a chave tem limite). */
export function BarraDoLimite({ c }: { c: UsoDaChave }) {
  if (c.limiteMensalTokens == null) return null;
  const pct = Math.round((c.pct ?? 0) * 100);
  return (
    <div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-hover"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Uso do limite de ${c.nome}`}
      >
        <div className={cn("h-full rounded-full", COR_DA_BARRA[c.nivel])} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className={cn("mt-1 text-caption", c.nivel === "estourado" ? "text-danger" : c.nivel === "alerta" ? "text-warning" : "text-text-tertiary")}>
        {pct}% de {compacto.format(c.limiteMensalTokens)} tokens
        {c.nivel === "estourado" && " · fora da fila até o mês virar"}
        {c.nivel === "alerta" && " · perto do limite"}
      </p>
    </div>
  );
}

/** Limite por mês e preço por milhão de tokens de uma chave. */
export function LimiteDaChave({ c, aoSalvar }: { c: UsoDaChave; aoSalvar: () => void }) {
  const [limite, setLimite] = React.useState(c.limiteMensalTokens ? String(c.limiteMensalTokens) : "");
  const [preco, setPreco] = React.useState(c.precoMilhaoBrl != null ? String(c.precoMilhaoBrl) : "");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  async function salvar(credentialId: string) {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const res = await fetch(`/api/ia/limites/${credentialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limiteMensalTokens: limite.trim() ? Number(limite.replace(/\D/g, "")) : null,
          precoMilhaoBrl: preco.trim() ? Number(preco.replace(",", ".")) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não deu para salvar.");
      setSalvo(true);
      aoSalvar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Limite por mês (tokens)" hint="Chegou nele, a chave sai da fila até virar o mês.">
          <Input id={`lim-${c.credentialId}`} inputMode="numeric" placeholder="sem limite" value={limite} onChange={(e) => setLimite(e.target.value)} />
        </Field>
        <Field label="Preço por 1 milhão de tokens (R$)" hint="Serve só para estimar o custo.">
          <Input id={`preco-${c.credentialId}`} inputMode="decimal" placeholder="opcional" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </Field>
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div className="flex items-center justify-end gap-2">
        {salvo && <span className="mr-auto text-small text-text-tertiary">Salvo.</span>}
        <Button variant="secondary" loading={salvando} onClick={() => salvar(c.credentialId)}>
          {salvando ? "Salvando..." : "Salvar limite e preço"}
        </Button>
      </div>
    </div>
  );
}

/** Tokens por agente no mês (e a reserva da plataforma). */
export function UsoPorAgente({ resumo }: { resumo: ResumoDoUso }) {
  if (resumo.agentes.length === 0 && resumo.plataforma.chamadas === 0) {
    return <p className="text-small text-text-tertiary">Nenhum agente usou IA neste mês ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {resumo.agentes.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          {resumo.agentes.map((a) => (
            <li key={a.agentId ?? "fora"} className="flex min-h-11 items-center justify-between gap-3 px-1 text-small">
              <span className="truncate text-text-primary">{a.nome}</span>
              <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
                {compacto.format(a.tokens)} tokens · {a.chamadas} {a.chamadas === 1 ? "chamada" : "chamadas"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resumo.plataforma.chamadas > 0 && (
        <p className="text-caption text-text-tertiary">
          Chave da plataforma (reserva da Eva): {compacto.format(resumo.plataforma.tokens)} tokens em {resumo.plataforma.chamadas} chamadas.
        </p>
      )}
    </div>
  );
}
