"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, UserCheck, MessageSquare, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { ICON_REGISTRY, type IconKey } from "@/components/agent-studio/builder/icon-registry";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Insights.
//
// A versão anterior tinha três painéis e dois eram inventados, com um selo de
// "Simulado" e um parágrafo explicando por quê. Painel que pede desculpa não é
// insight. Aqui tudo sai de tabela, e o que precisaria de um modelo lendo as
// conversas simplesmente não está — em vez de estar, fingindo.
// ---------------------------------------------------------------------------

const PERIODOS = [7, 30, 90];

const CANAL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  webchat: "Site",
  website: "Site",
};

interface Payload {
  periodo: number;
  volume: {
    conversas: number;
    mensagensDeContato: number;
    escalaram: number;
    autonomia: number | null;
  };
  porCanal: { label: string; value: number; escalou: number }[];
  ondePara: { label: string; kind: string; total: number; erros: number }[];
  termos: { label: string; value: number }[];
  porHora: { label: string; value: number }[];
}

export default function InsightsPage() {
  const [dias, setDias] = React.useState(30);
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    setCarregando(true);
    fetch(`/api/analytics/insights?dias=${dias}`)
      .then((r) => r.json())
      .then((d) => setDados(d.error ? null : d))
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, [dias]);

  const v = dados?.volume;
  const semNada = !!dados && dados.volume.conversas === 0;

  return (
    <div className="flex-1 p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Insights</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">
            O que as conversas dos seus agentes mostram: quanto eles resolvem sozinhos, onde as pessoas travam
            e a que horas elas escrevem.
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={cn(
                "rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                dias === d ? "bg-ice text-bg-base" : "bg-surface-2 text-text-secondary hover:text-text-primary"
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </header>

      {carregando && !dados ? (
        <p className="text-[13px] text-text-tertiary">Carregando...</p>
      ) : semNada ? (
        <div className="glass-card rounded-3xl px-6 py-16 text-center">
          <MessageSquare size={32} className="mx-auto mb-4 text-text-tertiary" />
          <h2 className="font-display text-xl font-semibold text-text-primary">
            Nenhuma conversa nos últimos {dias} dias
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-text-secondary">
            Esta tela lê conversas reais. Assim que o agente atender alguém — pelo canal ou pelo Playground —
            os números aparecem aqui.
          </p>
          <Link
            href="/playground"
            className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-400 hover:text-accent-300"
          >
            Testar um agente agora <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* O número que define um produto de atendimento automático. */}
          <section className="glass-card mb-4 flex flex-wrap items-center justify-between gap-6 rounded-3xl px-6 py-5">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-400">
                <Bot size={22} />
              </span>
              <div>
                <p className="text-[12px] text-text-tertiary">O agente resolveu sozinho</p>
                <p className="font-display text-[30px] font-semibold leading-tight text-text-primary tabular-nums">
                  {v?.autonomia === null || v?.autonomia === undefined
                    ? "—"
                    : `${(v.autonomia * 100).toFixed(0)}%`}
                </p>
                <p className="text-[12px] text-text-tertiary">
                  {v?.conversas ?? 0} conversa(s) no período, {v?.escalaram ?? 0} pediram atendente
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-8">
              <Numero
                icon={<MessageSquare size={14} />}
                rotulo="mensagens recebidas"
                valor={String(v?.mensagensDeContato ?? 0)}
              />
              <Numero
                icon={<UserCheck size={14} />}
                rotulo="esperando atendente"
                valor={String(v?.escalaram ?? 0)}
                alerta={(v?.escalaram ?? 0) > 0}
                href="/conversas"
              />
            </div>
          </section>

          <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* O painel mais acionável da tela. */}
            <section className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-[15px] font-semibold text-text-primary">Onde a conversa para</h2>
              <p className="mb-4 mt-1 text-[11.5px] text-text-tertiary">
                Último bloco de cada execução. Bloco que aparece muito aqui é onde as pessoas desistem — ou onde
                o fluxo quebra.
              </p>
              {(dados?.ondePara.length ?? 0) === 0 ? (
                <Vazio texto="Nenhuma execução registrada no período." />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {dados!.ondePara.map((p, i) => {
                    const Icone = ICON_REGISTRY[p.kind as IconKey] ?? MessageSquare;
                    const maior = dados!.ondePara[0].total;
                    return (
                      <div key={`${p.label}-${i}`} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <Icone size={13} className="shrink-0 text-text-tertiary" />
                            <span className="truncate text-[13px] text-text-primary">{p.label}</span>
                            {p.erros > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-[10.5px] text-danger">
                                <AlertTriangle size={9} /> {p.erros} com erro
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[12.5px] tabular-nums text-text-tertiary">
                            {p.total}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-surface-3">
                          <div
                            className={cn(
                              "h-1 rounded-full",
                              p.erros > 0 ? "bg-danger/70" : "bg-accent-500/70"
                            )}
                            style={{ width: `${Math.max(3, (p.total / maior) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-[15px] font-semibold text-text-primary">Por canal</h2>
              <p className="mb-4 mt-1 text-[11.5px] text-text-tertiary">
                Conversas e quantas delas precisaram de gente.
              </p>
              {(dados?.porCanal.length ?? 0) === 0 ? (
                <Vazio texto="Sem conversas no período." />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {dados!.porCanal.map((c) => {
                    const maior = Math.max(1, ...dados!.porCanal.map((x) => x.value));
                    return (
                      <div key={c.label}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
                          <span className="truncate text-text-secondary">
                            {CANAL_LABEL[c.label] ?? c.label}
                          </span>
                          <span className="shrink-0 tabular-nums text-text-tertiary">
                            {c.value}
                            {c.escalou > 0 && (
                              <span className="ml-1.5 text-amber-300">{c.escalou} p/ humano</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-3">
                          <div
                            className="h-1.5 rounded-full bg-accent-500/70"
                            style={{ width: `${Math.max(2, (c.value / maior) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="glass-card rounded-3xl p-5">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-text-primary">
                <Clock size={15} className="text-text-tertiary" /> A que horas escrevem
              </h2>
              <p className="mb-4 mt-1 text-[11.5px] text-text-tertiary">
                Mensagens recebidas por hora, no fuso de São Paulo.
              </p>
              {(dados?.porHora ?? []).some((h) => h.value > 0) ? (
                <BarChart data={dados!.porHora} height={170} />
              ) : (
                <Vazio texto="Sem mensagens no período." />
              )}
            </section>

            <section className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-[15px] font-semibold text-text-primary">O que mais falam</h2>
              <p className="mb-4 mt-1 text-[11.5px] text-text-tertiary">
                Palavras que mais aparecem nas mensagens recebidas, contadas uma vez por mensagem. É contagem,
                não classificação de tema — dizer &ldquo;tema&rdquo; sem um modelo lendo as conversas seria chute.
              </p>
              {(dados?.termos.length ?? 0) === 0 ? (
                <Vazio texto="Ainda não há mensagens suficientes." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dados!.termos.map((t, i) => (
                    <span
                      key={t.label}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[12px]",
                        i < 3
                          ? "bg-accent-soft text-accent-300"
                          : "bg-surface-2 text-text-secondary"
                      )}
                    >
                      {t.label} <span className="text-text-tertiary tabular-nums">{t.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Numero({
  icon, rotulo, valor, alerta, href,
}: {
  icon: React.ReactNode;
  rotulo: string;
  valor: string;
  alerta?: boolean;
  href?: string;
}) {
  const corpo = (
    <div>
      <p className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">{icon} {rotulo}</p>
      <p
        className={cn(
          "mt-1 font-display text-[22px] font-semibold tabular-nums",
          alerta ? "text-amber-300" : "text-text-primary"
        )}
      >
        {valor}
      </p>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-[12.5px] text-text-tertiary">{texto}</p>
  );
}
