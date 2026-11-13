"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ChevronRight, Plus, Send, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { OrbeEva } from "@/components/layout/orbe-eva";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeDate } from "@/lib/utils";

// Tela inicial do app de disparos, enxuta: saudação, o número do dia, os chips
// e os últimos disparos. O relatório completo mora na aba Relatórios.
// Dados: /api/broadcasts/overview.

interface Painel {
  hoje: { enviados: number; entregues: number; lidos: number; falhas: number; naFila: number };
  limiteDia: number;
  chips: { canalId: string; numero: string; status: string; agentId: string | null; agente: string | null; usadosHoje: number }[];
  disparos: {
    id: string; agentId: string; agente: string; channel: string; texto: string; status: string; criadoEm: string;
    agendadoPara: string | null; total: number; enviados: number; falhas: number; entregues: number; lidos: number;
  }[];
}

const STATUS_DO_DISPARO: Record<string, { rotulo: string; variante: "info" | "success" | "neutral" | "warning" }> = {
  sending: { rotulo: "Enviando", variante: "info" },
  scheduled: { rotulo: "Agendado", variante: "warning" },
  done: { rotulo: "Concluído", variante: "success" },
  canceled: { rotulo: "Cancelado", variante: "neutral" },
};

const STATUS_DO_CHIP: Record<string, { rotulo: string; variante: "success" | "warning" | "danger" | "neutral" }> = {
  conectado: { rotulo: "Conectado", variante: "success" },
  pendente: { rotulo: "Aguardando QR", variante: "warning" },
  atencao: { rotulo: "Atenção", variante: "warning" },
  desconectado: { rotulo: "Desconectado", variante: "danger" },
};

const ULTIMOS = 3;

function saudacao(h: number) {
  return h < 12 ? "Bom dia," : h < 18 ? "Boa tarde," : "Boa noite,";
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

function Barra({ valor, total, className }: { valor: number; total: number; className?: string }) {
  const p = Math.min(100, pct(valor, total));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[linear-gradient(90deg,#6eaaff,#b48cff)] transition-[width] duration-500" style={{ width: `${p}%` }} />
    </div>
  );
}

export function PainelDeDisparos() {
  const { session } = useAuth();
  const [dados, setDados] = React.useState<Painel | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch("/api/broadcasts/overview", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui carregar o painel.");
      setDados(j);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar o painel.");
    }
  }, []);

  React.useEffect(() => {
    void carregar();
    // Disparo em andamento muda a cada poucos segundos: atualiza enquanto a aba está visível.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const primeiroNome = session?.name?.split(" ")[0] ?? "";
  const hoje = dados?.hoje;

  return (
    // Monitor grande: usa a largura (até 1800px) em vez de virar uma ilha no meio.
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 pb-10 pt-4 sm:px-6 lg:gap-6 lg:px-8 lg:pt-6 2xl:px-12">

      <header className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[30px] leading-[1.05] tracking-tight text-text-primary sm:text-[40px] 2xl:text-[52px]">
          <span className="font-normal">{saudacao(new Date().getHours())}</span>
          <br />
          <b className="font-semibold">{primeiroNome || "tudo pronto"}!</b>
        </h1>
        <OrbeEva className="hidden h-[64px] w-[64px] shrink-0 sm:block" />
        <Link
          href="/broadcasts?new=1"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-text-primary px-4 text-small font-semibold text-bg-base transition-transform active:scale-[0.97] sm:px-5"
        >
          <Plus size={16} aria-hidden /> <span>Novo disparo</span>
        </Link>
      </header>

      {erro && <p className="rounded-2xl bg-danger-subtle px-4 py-3 text-small text-danger">{erro}</p>}

      {/* Computador: destaque e disparos à esquerda (2/3), chips e relatório à direita (1/3). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6 2xl:gap-8">
        {/* O dia de hoje: um número grande e uma linha de apoio. */}
        <section
          aria-label="Disparos de hoje"
          className="relative overflow-hidden rounded-[28px] p-5 text-[#0d0d14] shadow-[0_24px_60px_-24px_rgb(110_120_255/0.55)] lg:col-span-2 lg:p-7"
          style={{ background: "linear-gradient(135deg, #8fc0ff 0%, #c8b4ff 52%, #ffc6e0 100%)" }}
        >
          <p className="text-small font-medium opacity-75">Enviados hoje</p>
          <p className="mt-1 font-display text-[48px] font-semibold leading-none tracking-tight lg:text-[64px] 2xl:text-[88px]">{dados ? fmt(hoje!.enviados) : "—"}</p>
          <p className="mt-3 text-small opacity-75">
            {dados
              ? [
                  `${fmt(hoje!.entregues)} entregues`,
                  `${fmt(hoje!.lidos)} lidos`,
                  hoje!.falhas > 0 ? `${fmt(hoje!.falhas)} não chegaram` : null,
                  hoje!.naFila > 0 ? `${fmt(hoje!.naFila)} na fila` : null,
                ].filter(Boolean).join(" · ")
              : "Carregando…"}
          </p>
        </section>

        {/* Coluna da direita: chips e, logo abaixo, o relatório completo. */}
        <div className="flex flex-col gap-5 lg:row-span-2 lg:gap-6">
        <section aria-labelledby="chips-titulo" className="rounded-[24px] border border-border-subtle bg-panel p-4 lg:p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="chips-titulo" className="text-body font-semibold text-text-primary">Chips</h2>
            <Link href="/chips" className="ml-auto text-small font-medium text-accent-fg">Ver</Link>
          </div>
          {!dados ? (
            <p className="text-small text-text-tertiary">Carregando…</p>
          ) : dados.chips.length === 0 ? (
            <Link href="/chips" className="flex items-center gap-3 rounded-2xl bg-raised p-3 text-small text-text-secondary hover:bg-hover">
              <Smartphone size={18} /> Conecte o primeiro chip pelo QR code.
              <ChevronRight size={16} className="ml-auto" />
            </Link>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {dados.chips.map((c) => {
                const st = STATUS_DO_CHIP[c.status] ?? STATUS_DO_CHIP.pendente;
                return (
                  <li key={c.canalId} className="flex items-center gap-2 text-small">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium tabular-nums text-text-primary">{c.numero}</span>
                      <span className="block text-caption text-text-tertiary">{fmt(c.usadosHoje)} hoje</span>
                    </span>
                    <Badge variant={st.variante}>{st.rotulo}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <Link
          href="/reports"
          className="flex items-center gap-2 rounded-[22px] border border-border-subtle bg-panel px-4 py-3.5 text-small font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary"
        >
          Relatório completo <ChevronRight size={16} className="ml-auto" aria-hidden />
        </Link>
        </div>

        {/* Últimos disparos: título, quando, barra e uma linha de números. */}
        <section aria-labelledby="disparos-titulo" className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center">
            <h2 id="disparos-titulo" className="text-body-lg font-semibold text-text-primary">Últimos disparos</h2>
            <Link href="/broadcasts" className="ml-auto text-small font-medium text-accent-fg">Ver todos</Link>
          </div>
          {dados && dados.disparos.length === 0 && (
            <Link href="/broadcasts?new=1" className="flex items-center gap-3 rounded-[24px] border border-dashed border-border-default p-5 text-small text-text-secondary hover:bg-raised">
              <Send size={18} /> Nenhum disparo ainda. Crie o primeiro.
            </Link>
          )}
          {dados?.disparos.slice(0, ULTIMOS).map((d) => {
            const st = STATUS_DO_DISPARO[d.status] ?? STATUS_DO_DISPARO.sending;
            const feito = d.enviados + d.falhas;
            return (
              <Link
                key={d.id}
                href={`/broadcasts?agent=${d.agentId}&b=${d.id}`}
                className="flex flex-col gap-2.5 rounded-[22px] border border-border-subtle bg-panel p-4 transition-colors hover:bg-raised"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-text-primary">{d.texto || "Disparo sem texto"}</p>
                    <p className="text-caption text-text-tertiary">{formatRelativeDate(d.agendadoPara ?? d.criadoEm)}</p>
                  </div>
                  <Badge variant={st.variante}>{st.rotulo}</Badge>
                </div>
                <Barra valor={feito} total={d.total} />
                <p className="text-caption text-text-tertiary">
                  {fmt(feito)} de {fmt(d.total)} · {fmt(d.entregues)} entregues
                  {d.falhas > 0 && <span className="text-danger"> · {fmt(d.falhas)} não chegaram</span>}
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
