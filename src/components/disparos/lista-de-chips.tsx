"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Plus, QrCode, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROTULO_DA_QUALIDADE, type NivelDeQualidade } from "@/lib/disparos/qualidade";
import { cn, formatRelativeDate } from "@/lib/utils";

// Chips do app de disparos: cada número conectado por QR, com a situação da
// sessão, o uso de hoje contra o limite do anti-ban, o último disparo e a
// qualidade dos envios da semana. Conectar um chip novo continua em
// Configurações → Canais (o fluxo do QR mora lá). Dados: /api/chips.

interface Chip {
  canalId: string;
  numero: string;
  status: string;
  sessao: string;
  erro: string | null;
  conectadoDesde: string | null;
  caiuEm: string | null;
  quedasSeguidas: number;
  agentId: string | null;
  agente: string | null;
  usadosHoje: number;
  ultimoDisparo: string | null;
  enviados: number;
  entregues: number;
  falhas: number;
  nivel: NivelDeQualidade;
  taxaDeEntrega: number | null;
  taxaDeFalha: number | null;
}

interface Resposta {
  limiteDia: number;
  dias: number;
  chips: Chip[];
}

const SITUACAO: Record<string, { rotulo: string; variante: "success" | "warning" | "danger" | "neutral" }> = {
  connected: { rotulo: "Conectado", variante: "success" },
  qr_pending: { rotulo: "Esperando QR", variante: "warning" },
  requesting: { rotulo: "Gerando QR", variante: "warning" },
  logging_out: { rotulo: "Desconectando", variante: "neutral" },
  disconnected: { rotulo: "Desconectado", variante: "danger" },
};

const QUALIDADE: Record<NivelDeQualidade, "success" | "warning" | "danger" | "neutral"> = {
  boa: "success",
  atencao: "warning",
  ruim: "danger",
  sem_dados: "neutral",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function ListaDeChips() {
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    async function carregar() {
      try {
        const r = await fetch("/api/chips", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não consegui carregar os chips.");
        if (vivo) {
          setDados(j);
          setErro(null);
        }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não consegui carregar os chips.");
      }
    }
    void carregar();
    const t = setInterval(() => document.visibilityState === "visible" && void carregar(), 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  const conectados = dados?.chips.filter((c) => c.sessao === "connected").length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-10 pt-4 sm:px-6 lg:pt-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text-primary">Chips</h1>
          <p className="text-small text-text-tertiary">
            {dados ? `${conectados} de ${dados.chips.length} conectados · limite de ${dados.limiteDia} por chip/dia` : "Carregando…"}
          </p>
        </div>
        <Link
          href="/settings?tab=channels"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-small font-semibold text-bg-base transition-transform active:scale-[0.97]"
        >
          <Plus size={16} aria-hidden /> Conectar chip
        </Link>
      </header>

      {erro && <p className="rounded-2xl bg-danger-subtle px-4 py-3 text-small text-danger">{erro}</p>}

      {dados && dados.chips.length === 0 && (
        <Link
          href="/settings?tab=channels"
          className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-border-default px-6 py-12 text-center hover:bg-raised"
        >
          <QrCode size={36} className="text-text-tertiary" aria-hidden />
          <p className="text-body font-semibold text-text-primary">Nenhum chip ainda</p>
          <p className="max-w-sm text-small text-text-secondary">Conecte o primeiro número lendo o QR code com o WhatsApp do celular.</p>
        </Link>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {dados?.chips.map((c) => {
          const st = SITUACAO[c.sessao] ?? SITUACAO.disconnected;
          const uso = dados.limiteDia > 0 ? Math.min(100, Math.round((c.usadosHoje / dados.limiteDia) * 100)) : 0;
          return (
            <li key={c.canalId} className="flex flex-col gap-4 rounded-[24px] border border-border-subtle bg-panel p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-text-secondary">
                  <Smartphone size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-body font-semibold text-text-primary">{c.numero}</p>
                  <p className="truncate text-caption text-text-tertiary">{c.agente ? `Agente: ${c.agente}` : "Sem agente ligado"}</p>
                </div>
                <Badge variant={st.variante}>{st.rotulo}</Badge>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-caption text-text-tertiary">
                  <span>Uso de hoje</span>
                  <span className="tabular-nums">
                    {fmt(c.usadosHoje)} de {fmt(dados.limiteDia)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={uso} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#6eaaff,#b48cff)]" style={{ width: `${uso}%` }} />
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-caption">
                <div>
                  <dt className="text-text-tertiary">Qualidade</dt>
                  <dd className="mt-0.5">
                    <Badge variant={QUALIDADE[c.nivel]}>{ROTULO_DA_QUALIDADE[c.nivel]}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Entrega ({dados.dias}d)</dt>
                  <dd className="text-small font-semibold tabular-nums text-text-primary">{pct(c.taxaDeEntrega)}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Falha ({dados.dias}d)</dt>
                  <dd className={cn("text-small font-semibold tabular-nums", (c.taxaDeFalha ?? 0) > 0.05 ? "text-danger" : "text-text-primary")}>
                    {pct(c.taxaDeFalha)}
                  </dd>
                </div>
              </dl>

              <p className="text-caption text-text-tertiary">
                {c.ultimoDisparo ? `Último disparo ${formatRelativeDate(c.ultimoDisparo)}` : "Ainda não disparou"}
                {` · ${fmt(c.enviados)} enviados, ${fmt(c.falhas)} falhas em ${dados.dias} dias`}
                {c.quedasSeguidas > 0 && ` · caiu ${c.quedasSeguidas}x seguidas`}
              </p>
              {c.erro && c.sessao !== "connected" && <p className="rounded-xl bg-danger-subtle px-3 py-2 text-caption text-danger">{c.erro}</p>}
            </li>
          );
        })}
      </ul>

      {dados && dados.chips.length > 0 && (
        <p className="text-caption text-text-tertiary">
          A qualidade é medida pelos nossos envios (entregues e falhas dos últimos {dados.dias} dias), não é uma nota do WhatsApp. Chip em
          &quot;Ruim&quot; deve descansar: menos envios por alguns dias.
        </p>
      )}
    </div>
  );
}
