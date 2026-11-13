"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ChevronRight, Contact, MessageSquare, Plus, Send, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { OrbeEva } from "@/components/layout/orbe-eva";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeDate } from "@/lib/utils";

// Tela inicial do app de disparos. Celular primeiro (referência aprovada em
// 13/11/2026): saudação grande, um cartão de destaque com o dia, três ações
// grandes e cartões arredondados com barra de progresso. No computador as
// mesmas peças se abrem em duas colunas. Dados: /api/broadcasts/overview.

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

function saudacao(h: number) {
  return h < 12 ? "Bom dia," : h < 18 ? "Boa tarde," : "Boa noite,";
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

function Barra({ valor, total, className }: { valor: number; total: number; className?: string }) {
  const p = Math.min(100, pct(valor, total));
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
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
  const tentados = (hoje?.enviados ?? 0) + (hoje?.falhas ?? 0);

  return (
    // Celular: uma coluna na ordem da referência. Computador: a tela inteira, em
    // três colunas (destaque + ações em cima, disparos + chips embaixo).
    <div className="flex w-full flex-col gap-5 px-4 pb-10 pt-4 sm:px-6 lg:gap-6 lg:px-8 lg:pt-6">
      {/* Saudação grande, como na referência; a esfera da Eva no canto. */}
      <header className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[32px] leading-[1.05] tracking-tight text-text-primary sm:text-[40px]">
          <span className="font-normal">{saudacao(new Date().getHours())}</span>
          <br />
          <b className="font-semibold">{primeiroNome || "tudo pronto"}!</b>
        </h1>
        <Link
          href="/broadcasts?new=1"
          className="hidden h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-small font-semibold text-bg-base transition-transform active:scale-[0.97] lg:inline-flex"
        >
          <Plus size={16} aria-hidden /> Novo disparo
        </Link>
        <OrbeEva className="h-[72px] w-[72px] shrink-0" />
      </header>

      {erro && <p className="rounded-2xl bg-danger-subtle px-4 py-3 text-small text-danger">{erro}</p>}

      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
          {/* Cartão de destaque: o dia de hoje. */}
          <section
            aria-label="Disparos de hoje"
            className="relative overflow-hidden rounded-[28px] p-5 text-[#0d0d14] shadow-[0_24px_60px_-24px_rgb(110_120_255/0.55)] lg:col-span-2 lg:p-7"
            style={{ background: "linear-gradient(135deg, #8fc0ff 0%, #c8b4ff 52%, #ffc6e0 100%)" }}
          >
            <p className="text-small font-medium opacity-75">Enviados hoje</p>
            <p className="mt-1 font-display text-[44px] font-semibold leading-none tracking-tight lg:text-[64px]">{dados ? fmt(hoje!.enviados) : "—"}</p>
            <p className="mt-2 text-small opacity-75">
              {dados ? `${fmt(hoje!.naFila)} na fila · ${pct(hoje!.entregues, hoje!.enviados)}% entregues` : "Carregando…"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-6 lg:gap-3">
              {[
                { rotulo: "Entregues", valor: hoje?.entregues },
                { rotulo: "Lidos", valor: hoje?.lidos },
                { rotulo: "Não chegaram", valor: hoje?.falhas },
              ].map((n) => (
                <div key={n.rotulo} className="rounded-2xl bg-white/45 px-3 py-2.5 backdrop-blur">
                  <p className="text-caption opacity-70">{n.rotulo}</p>
                  <p className="text-body-lg font-semibold">{n.valor == null ? "—" : fmt(n.valor)}</p>
                </div>
              ))}
            </div>
            {tentados > 0 && (
              <p className="mt-3 text-caption opacity-70">
                {pct(hoje!.falhas, tentados)}% não chegaram hoje
              </p>
            )}
          </section>

          {/* Três ações grandes. */}
          <nav aria-label="Atalhos" className="grid grid-cols-3 gap-2.5 lg:grid-cols-1 lg:grid-rows-3 lg:gap-3">
            {[
              { href: "/broadcasts?new=1", acima: "Criar", rotulo: "Disparo", icone: <Plus size={16} /> },
              { href: "/contacts", acima: "Ver", rotulo: "Contatos", icone: <Contact size={16} /> },
              { href: "/conversations", acima: "Abrir", rotulo: "Conversas", icone: <MessageSquare size={16} /> },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex h-[104px] flex-col justify-between rounded-[22px] border border-border-subtle bg-panel p-3.5 transition-[transform,background-color] duration-150 hover:bg-raised active:scale-[0.97] lg:h-auto lg:flex-row-reverse lg:items-center lg:px-5"
              >
                <span className="flex h-8 w-8 items-center justify-center self-end rounded-full border border-border-default text-text-secondary lg:self-auto">{a.icone}</span>
                <span>
                  <span className="block text-caption text-text-tertiary">{a.acima}</span>
                  <span className="block text-body font-semibold text-text-primary">{a.rotulo}</span>
                </span>
              </Link>
            ))}
          </nav>

          {/* Chips: uso de hoje contra o limite do anti-ban. */}
          <section aria-labelledby="chips-titulo" className="order-3 self-start rounded-[24px] border border-border-subtle bg-panel p-4 lg:order-4 lg:p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 id="chips-titulo" className="text-body font-semibold text-text-primary">Chips hoje</h2>
              <span className="text-caption text-text-tertiary">limite de {dados?.limiteDia ?? 200} por chip</span>
              <Link href="/chips" className="ml-auto text-small font-medium text-accent-fg">Ver chips</Link>
            </div>
            {!dados ? (
              <p className="text-small text-text-tertiary">Carregando…</p>
            ) : dados.chips.length === 0 ? (
              <Link href="/settings?tab=channels" className="flex items-center gap-3 rounded-2xl bg-raised p-3 text-small text-text-secondary hover:bg-hover">
                <Smartphone size={18} /> Nenhum chip conectado. Conecte o primeiro pelo QR code.
                <ChevronRight size={16} className="ml-auto" />
              </Link>
            ) : (
              <ul className="flex flex-col gap-3">
                {dados.chips.map((c) => {
                  const st = STATUS_DO_CHIP[c.status] ?? STATUS_DO_CHIP.pendente;
                  return (
                    <li key={c.canalId} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-small">
                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{c.agente ?? "Sem agente"} <span className="font-normal text-text-tertiary">· {c.numero}</span></span>
                        <Badge variant={st.variante}>{st.rotulo}</Badge>
                      </div>
                      <Barra valor={c.usadosHoje} total={dados.limiteDia} />
                      <p className="text-caption text-text-tertiary">{fmt(c.usadosHoje)} de {fmt(dados.limiteDia)} hoje</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

        {/* Lista de disparos, como a "lista de metas" da referência. */}
        <section aria-labelledby="disparos-titulo" className="order-4 flex flex-col gap-3 lg:order-3 lg:col-span-2">
          <div className="flex items-center">
            <h2 id="disparos-titulo" className="text-body-lg font-semibold text-text-primary">Disparos</h2>
            <Link href="/broadcasts" className="ml-auto text-small font-medium text-accent-fg">Ver todos</Link>
          </div>
          {dados && dados.disparos.length === 0 && (
            <Link href="/broadcasts?new=1" className="flex items-center gap-3 rounded-[24px] border border-dashed border-border-default p-5 text-small text-text-secondary hover:bg-raised">
              <Send size={18} /> Nenhum disparo ainda. Crie o primeiro.
            </Link>
          )}
          {dados?.disparos.map((d) => {
            const st = STATUS_DO_DISPARO[d.status] ?? STATUS_DO_DISPARO.sending;
            const feito = d.enviados + d.falhas;
            return (
              <Link
                key={d.id}
                href={`/broadcasts?agent=${d.agentId}&b=${d.id}`}
                className="flex flex-col gap-3 rounded-[24px] border border-border-subtle bg-panel p-4 transition-colors hover:bg-raised"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-text-primary">{d.texto || "Disparo sem texto"}</p>
                    <p className="text-caption text-text-tertiary">{d.agente} · {formatRelativeDate(d.agendadoPara ?? d.criadoEm)}</p>
                  </div>
                  <Badge variant={st.variante}>{st.rotulo}</Badge>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-caption text-text-tertiary">
                    <span>Progresso</span>
                    <span>{pct(feito, d.total)}%</span>
                  </div>
                  <Barra valor={feito} total={d.total} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-caption">
                  {[
                    { r: "Total", v: d.total },
                    { r: "Entregues", v: d.entregues },
                    { r: "Lidos", v: d.lidos },
                    { r: "Não chegaram", v: d.falhas, perigo: d.falhas > 0 },
                  ].map((n) => (
                    <div key={n.r}>
                      <p className="text-text-tertiary">{n.r}</p>
                      <p className={cn("text-small font-semibold", n.perigo ? "text-danger" : "text-text-primary")}>{fmt(n.v)}</p>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
