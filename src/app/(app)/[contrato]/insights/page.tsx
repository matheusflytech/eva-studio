"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowRight, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { focusRing } from "@/components/ui/styles";
import { MarcaEva } from "@/components/layout/marca-eva";
import { ICON_REGISTRY, type IconKey } from "@/components/agent-studio/builder/icon-registry";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Insights.
//
// A versão anterior tinha três painéis e dois eram inventados, com um selo de
// "Simulado" e um parágrafo explicando por quê. Painel que pede desculpa não é
// insight. Aqui tudo sai de tabela, e o que precisaria de um modelo lendo as
// conversas simplesmente não está — em vez de estar, fingindo.
//
// v5: três números no topo e uma análise por vez, em abas. Abre em "Onde a
// conversa para", que é a que pede ação; mostra os blocos que mais param e o
// resto abre em "Ver os N blocos".
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

/** Blocos de IA levam o símbolo da Eva no lugar do ícone do bloco. */
const BLOCOS_DE_IA = new Set(["agent", "ai-agent"]);

/** Quantas linhas aparecem antes do "Ver os N". */
const PRIMEIROS = 4;

type Aba = "ondePara" | "horarios" | "termos" | "canais";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "ondePara", rotulo: "Onde a conversa para" },
  { valor: "horarios", rotulo: "Horários" },
  { valor: "termos", rotulo: "O que mais falam" },
  { valor: "canais", rotulo: "Por canal" },
];

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
  const [aba, setAba] = React.useState<Aba>("ondePara");

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título e, à direita, o período em cápsula. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Insights</h1>
        <span className="font-mono text-caption text-text-tertiary">conversas dos agentes</span>
        <div className="ml-auto">
          <SegmentedControl
            label="Período"
            value={String(dias)}
            onChange={(d) => setDias(Number(d))}
            options={PERIODOS.map((d) => ({ value: String(d), label: `${d} dias` }))}
          />
        </div>
      </div>

      {carregando && !dados ? (
        <div className="flex w-full max-w-[820px] flex-col gap-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-[18px] bg-raised motion-reduce:animate-none" />
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
          ))}
        </div>
      ) : semNada ? (
        <div className="w-full max-w-[820px] rounded-[18px] border border-border-subtle bg-panel px-5 py-10 text-center">
          <p className="text-body font-medium text-text-primary">Nenhuma conversa nos últimos {dias} dias.</p>
          <p className="mx-auto mt-1 max-w-md text-small text-text-secondary">
            Assim que um agente atender alguém, pelo canal ou pelo Playground, os números aparecem aqui.
          </p>
          <Link href="/playground" className="mt-4 inline-flex items-center gap-1 text-small font-medium text-accent-fg hover:underline">
            Testar um agente agora <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className={cn("flex w-full max-w-[820px] flex-col gap-5 transition-opacity", carregando && "opacity-60")}>
          {/* Três números, sem legenda longa. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Numero
              rotulo={
                <>
                  <MarcaEva size={13} className="text-text-secondary" /> Resolvido sem atendente
                </>
              }
              valor={v?.autonomia === null || v?.autonomia === undefined ? "—" : `${(v.autonomia * 100).toFixed(0)}%`}
              apoio={v ? `${Math.max(0, v.conversas - v.escalaram)} de ${v.conversas}` : undefined}
            />
            <Numero rotulo="Conversas" valor={(v?.conversas ?? 0).toLocaleString("pt-BR")} />
            <Numero
              rotulo="Esperando atendente"
              valor={(v?.escalaram ?? 0).toLocaleString("pt-BR")}
              alerta={(v?.escalaram ?? 0) > 0}
              apoio={
                (v?.escalaram ?? 0) > 0 ? (
                  <Link href="/conversas" className="inline-flex items-center gap-1 font-sans text-small font-medium text-accent-fg hover:underline">
                    Abrir conversas <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ) : undefined
              }
            />
          </div>

          {/* Uma análise por vez. */}
          <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <div role="tablist" aria-label="Análises" className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-raised p-0.5">
              {ABAS.map((a) => {
                const ativa = a.valor === aba;
                return (
                  <button
                    key={a.valor}
                    type="button"
                    role="tab"
                    id={`aba-${a.valor}`}
                    aria-selected={ativa}
                    aria-controls="painel-de-insights"
                    tabIndex={ativa ? 0 : -1}
                    onClick={() => setAba(a.valor)}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const i = ABAS.findIndex((x) => x.valor === aba);
                      const j = (i + (e.key === "ArrowRight" ? 1 : -1) + ABAS.length) % ABAS.length;
                      setAba(ABAS[j].valor);
                      document.getElementById(`aba-${ABAS[j].valor}`)?.focus();
                    }}
                    className={cn(
                      "inline-flex h-full shrink-0 items-center whitespace-nowrap rounded-full px-3 text-small transition-colors duration-150",
                      ativa ? "bg-inverse font-semibold text-inverse-fg" : "font-medium text-text-secondary hover:text-text-primary",
                      focusRing
                    )}
                  >
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
          </div>

          <div id="painel-de-insights" role="tabpanel" aria-labelledby={`aba-${aba}`}>
            {aba === "ondePara" && <OndePara itens={dados?.ondePara ?? []} />}
            {aba === "horarios" && <Horarios porHora={dados?.porHora ?? []} mensagens={v?.mensagensDeContato ?? 0} />}
            {aba === "termos" && <Termos termos={dados?.termos ?? []} />}
            {aba === "canais" && <Canais canais={dados?.porCanal ?? []} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo, valor, apoio, alerta,
}: {
  rotulo: React.ReactNode;
  valor: string;
  apoio?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-border-subtle bg-panel px-5 py-4">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-small text-text-secondary">{rotulo}</span>
      <span className={cn("text-display font-medium tracking-[-0.035em] tabular-nums", alerta ? "text-warning" : "text-text-primary")}>{valor}</span>
      {apoio && <span className="truncate font-mono text-caption text-text-tertiary">{apoio}</span>}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo}>
      <h2 className="px-1 pb-1 font-mono text-caption text-text-tertiary">{titulo}</h2>
      {children}
    </section>
  );
}

/** Linha com ícone, nome (e uma linha de apoio), barra proporcional e número. */
function LinhaDeBarra({
  icone, rotulo, apoio, apoioTom, fracao, perigo, valor,
}: {
  icone?: React.ReactNode;
  rotulo: string;
  apoio?: string;
  apoioTom?: "danger" | "warning";
  fracao: number;
  perigo?: boolean;
  valor: number;
}) {
  return (
    <li className="relative flex min-h-[54px] items-center gap-3.5 px-1 py-1.5 before:absolute before:left-9 before:right-0 before:top-0 before:h-px before:bg-border-subtle first:before:hidden">
      <span className="flex size-5 shrink-0 items-center justify-center text-text-tertiary" aria-hidden="true">
        {icone}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-text-primary">{rotulo}</span>
        {apoio && <span className={cn("truncate text-caption", apoioTom === "danger" ? "text-danger" : "text-warning")}>{apoio}</span>}
      </span>
      <span className="hidden h-1.5 w-[220px] shrink-0 overflow-hidden rounded-full bg-hover sm:block" aria-hidden="true">
        <i className={cn("block h-full rounded-full", perigo ? "bg-danger" : "bg-accent-solid")} style={{ width: `${Math.max(3, fracao * 100)}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-medium tabular-nums text-text-primary">{valor.toLocaleString("pt-BR")}</span>
    </li>
  );
}

function VerMais({ total, aberto, aoAlternar, nome }: { total: number; aberto: boolean; aoAlternar: () => void; nome: string }) {
  if (total <= PRIMEIROS) return null;
  return (
    <button
      type="button"
      onClick={aoAlternar}
      aria-expanded={aberto}
      className="mt-3 inline-flex items-center gap-1 px-1 text-small font-medium text-accent-fg hover:underline"
    >
      {aberto ? "Mostrar menos" : `Ver os ${total} ${nome}`}
      {aberto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
    </button>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-[14px] bg-raised px-4 py-8 text-center text-small text-text-tertiary">{texto}</p>;
}

// Último bloco de cada execução: bloco que aparece muito aqui é onde as
// pessoas desistem, ou onde o fluxo quebra.
function OndePara({ itens }: { itens: Payload["ondePara"] }) {
  const [tudo, setTudo] = React.useState(false);
  if (itens.length === 0) return <Vazio texto="Nenhuma execução registrada no período." />;
  const maior = itens[0].total || 1;
  const visiveis = tudo ? itens : itens.slice(0, PRIMEIROS);
  return (
    <Grupo titulo="Último bloco de cada conversa">
      <ul>
        {visiveis.map((p, i) => {
          const Icone = ICON_REGISTRY[p.kind as IconKey] ?? MessageSquare;
          return (
            <LinhaDeBarra
              key={`${p.label}-${i}`}
              icone={BLOCOS_DE_IA.has(p.kind) ? <MarcaEva size={15} className="text-text-secondary" /> : <Icone size={16} strokeWidth={1.5} />}
              rotulo={p.label}
              apoio={p.erros > 0 ? `${p.erros} com erro` : undefined}
              apoioTom="danger"
              fracao={p.total / maior}
              // Barra vermelha só quando a maioria quebra; poucos erros ficam no texto.
              perigo={p.erros * 2 > p.total}
              valor={p.total}
            />
          );
        })}
      </ul>
      <VerMais total={itens.length} aberto={tudo} aoAlternar={() => setTudo((x) => !x)} nome="blocos" />
    </Grupo>
  );
}

function Horarios({ porHora, mensagens }: { porHora: Payload["porHora"]; mensagens: number }) {
  return (
    <Grupo titulo="Mensagens recebidas por hora · fuso de São Paulo">
      <div className="rounded-[18px] border border-border-subtle bg-panel px-5 py-4">
        <p className="flex items-baseline gap-2">
          <span className="text-display font-medium tracking-[-0.035em] tabular-nums text-text-primary">{mensagens.toLocaleString("pt-BR")}</span>
          <span className="text-small text-text-secondary">mensagens recebidas no período</span>
        </p>
        <div className="mt-4">
          {porHora.some((h) => h.value > 0) ? <BarChart data={porHora} height={170} /> : <Vazio texto="Sem mensagens no período." />}
        </div>
      </div>
    </Grupo>
  );
}

// Palavras que mais aparecem nas mensagens recebidas, contadas uma vez por
// mensagem. É contagem, não classificação de tema.
function Termos({ termos }: { termos: Payload["termos"] }) {
  if (termos.length === 0) return <Vazio texto="Ainda não há mensagens suficientes." />;
  return (
    <Grupo titulo="Palavras mais frequentes · contagem, não tema">
      <ul className="flex flex-wrap gap-1.5 pt-1">
        {termos.map((t, i) => (
          <li
            key={t.label}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-raised px-3 text-small",
              i < 3 ? "font-medium text-text-primary" : "text-text-secondary"
            )}
          >
            {t.label} <span className="font-mono text-caption tabular-nums text-text-tertiary">{t.value}</span>
          </li>
        ))}
      </ul>
    </Grupo>
  );
}

function Canais({ canais }: { canais: Payload["porCanal"] }) {
  const [tudo, setTudo] = React.useState(false);
  if (canais.length === 0) return <Vazio texto="Sem conversas no período." />;
  const maior = Math.max(1, ...canais.map((x) => x.value));
  const visiveis = tudo ? canais : canais.slice(0, PRIMEIROS);
  return (
    <Grupo titulo="Conversas por canal e quantas precisaram de gente">
      <ul>
        {visiveis.map((c) => (
          <LinhaDeBarra
            key={c.label}
            rotulo={CANAL_LABEL[c.label] ?? c.label}
            apoio={c.escalou > 0 ? `${c.escalou} para atendente` : undefined}
            apoioTom="warning"
            fracao={c.value / maior}
            valor={c.value}
          />
        ))}
      </ul>
      <VerMais total={canais.length} aberto={tudo} aoAlternar={() => setTudo((x) => !x)} nome="canais" />
    </Grupo>
  );
}
