"use client";

import * as React from "react";
import { Gauge, Pencil } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { IconButton } from "@/components/ui/icon-button";
import { buttonVariants } from "@/components/ui/button";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import { cn } from "@/lib/utils";

interface UsoDaChave {
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

interface Resumo {
  disponivel: boolean;
  chaves: UsoDaChave[];
  agentes: { agentId: string | null; nome: string; tokens: number; chamadas: number }[];
  plataforma: { tokens: number; chamadas: number };
}

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const rotuloDoTipo = (t: string) => LLM_PROVIDERS.find((p) => p.credentialType === t)?.label ?? t;

const COR_DA_BARRA: Record<UsoDaChave["nivel"], string> = {
  sem_limite: "bg-accent-solid",
  ok: "bg-success",
  alerta: "bg-warning",
  estourado: "bg-danger",
};

// Uso de IA do mês por chave (e por agente), com limite mensal em tokens e
// custo estimado pelo preço que o cliente informa. Chave que estoura o
// limite sai da fila da Central de IA até virar o mês; a reserva assume.
export function UsoIaPanel() {
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState("");
  const [preco, setPreco] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
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

  function abrir(c: UsoDaChave) {
    setEditando(c.credentialId);
    setLimite(c.limiteMensalTokens ? String(c.limiteMensalTokens) : "");
    setPreco(c.precoMilhaoBrl != null ? String(c.precoMilhaoBrl) : "");
    setErro(null);
  }

  async function salvar(credentialId: string) {
    setSalvando(true);
    setErro(null);
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
      setEditando(null);
      setVersao((v) => v + 1);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!resumo || resumo.chaves.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Uso de IA neste mês</p>
        <p className="mt-1 max-w-2xl text-[12.5px] text-text-secondary">
          Tokens que cada chave gastou desde o dia 1º. Com limite, a chave que chegar nele sai da fila até virar o mês
          e a reserva responde no lugar. O custo é estimado pelo preço que você informar.
        </p>
      </div>

      <div className="glass-card rounded-2xl">
        {!resumo.disponivel && (
          <div className="p-4">
            <Notice tone="warning">
              O controle de uso ainda não foi ativado no banco deste ambiente: nada está sendo contado e nenhum limite vale.
            </Notice>
          </div>
        )}

        <div className="divide-y divide-border-subtle">
          {resumo.chaves.map((c) => (
            <div key={c.credentialId} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                    <Gauge size={16} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-text-primary">
                      {c.nome} <span className="font-normal text-text-tertiary">· {rotuloDoTipo(c.tipo)}</span>
                    </p>
                    <p className="text-[12px] text-text-tertiary">
                      {compacto.format(c.tokens)} tokens · {c.chamadas} {c.chamadas === 1 ? "chamada" : "chamadas"}
                      {c.falhas > 0 && ` · ${c.falhas} com falha`}
                      {c.custoBrl != null && ` · ~${reais.format(c.custoBrl)}`}
                    </p>
                  </div>
                </div>
                {resumo.disponivel && editando !== c.credentialId && (
                  <IconButton aria-label={`Limite e preço de ${c.nome}`} tooltip="Limite e preço" size="sm" onClick={() => abrir(c)}>
                    <Pencil size={14} />
                  </IconButton>
                )}
              </div>

              {c.limiteMensalTokens != null && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round((c.pct ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso do limite de ${c.nome}`}>
                    <div className={cn("h-full rounded-full", COR_DA_BARRA[c.nivel])} style={{ width: `${Math.min(100, Math.round((c.pct ?? 0) * 100))}%` }} />
                  </div>
                  <p className={cn("mt-1 text-[11.5px]", c.nivel === "estourado" ? "text-danger" : c.nivel === "alerta" ? "text-warning" : "text-text-tertiary")}>
                    {Math.round((c.pct ?? 0) * 100)}% de {compacto.format(c.limiteMensalTokens)} tokens
                    {c.nivel === "estourado" && " · fora da fila até o mês virar"}
                    {c.nivel === "alerta" && " · perto do limite"}
                  </p>
                </div>
              )}

              {editando === c.credentialId && (
                <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-surface-2 p-3">
                  <div>
                    <Label htmlFor={`lim-${c.credentialId}`}>Limite por mês (tokens)</Label>
                    <Input id={`lim-${c.credentialId}`} inputMode="numeric" placeholder="sem limite" value={limite} onChange={(e) => setLimite(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor={`preco-${c.credentialId}`}>Preço por 1 milhão de tokens (R$)</Label>
                    <Input id={`preco-${c.credentialId}`} inputMode="decimal" placeholder="opcional" value={preco} onChange={(e) => setPreco(e.target.value)} />
                  </div>
                  <button type="button" disabled={salvando} onClick={() => salvar(c.credentialId)} className={buttonVariants({ variant: "solid", size: "sm" })}>
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="rounded-lg px-3 py-1.5 text-[12px] text-text-tertiary hover:text-text-primary">
                    Cancelar
                  </button>
                  {erro && <p className="w-full text-[12px] text-danger">{erro}</p>}
                </div>
              )}
            </div>
          ))}

          {resumo.plataforma.chamadas > 0 && (
            <p className="p-4 text-[12px] text-text-tertiary">
              Chave da plataforma (reserva da Eva): {compacto.format(resumo.plataforma.tokens)} tokens em {resumo.plataforma.chamadas} chamadas.
            </p>
          )}
        </div>

        {resumo.agentes.length > 0 && (
          <div className="border-t border-border-subtle p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Por agente</p>
            <ul className="flex flex-col gap-1">
              {resumo.agentes.map((a) => (
                <li key={a.agentId ?? "fora"} className="flex justify-between text-[12.5px]">
                  <span className="text-text-secondary">{a.nome}</span>
                  <span className="tabular-nums text-text-tertiary">
                    {compacto.format(a.tokens)} tokens · {a.chamadas} {a.chamadas === 1 ? "chamada" : "chamadas"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
