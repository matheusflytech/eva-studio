"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import Link from "@/components/contrato/link";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Visão geral do Dashboard: o mês até hoje em quatro cartões, o ritmo do mês,
// a receita mês a mês e quando os clientes mais escrevem. Fixa (não é montada
// pela pessoa); o painel montável fica logo abaixo.
// ---------------------------------------------------------------------------

interface Mes { mes: string; receita: number; vendas: number; criados: number }
interface Visao {
  canal: string;
  canaisComDados: string[];
  periodo: { de: string; ate: string; anteriorDe: string; anteriorAte: string };
  aoVivo: number;
  receita: { atual: number; anterior: number; porDia: number[] };
  vendas: { atual: number; anterior: number; porSemana: number[] };
  conversas: { atual: number; anterior: number; semAtendente: number | null };
  conversao: { atual: number | null; anterior: number | null; porMes: { mes: string; valor: number | null }[] };
  ritmo: { pontos: number; noRitmo: boolean; mediaMensal: number; esperadoAteHoje: number; melhorCanal: { canal: string; parte: number } | null };
  meses: Mes[];
  calor: number[][];
}

const ROTULO_DO_GRUPO: Record<string, string> = {
  whatsapp: "WhatsApp",
  website: "Site",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
};
const ROTULO_DO_CANAL: Record<string, string> = {
  whatsapp_meta: "O WhatsApp",
  whatsapp_qr: "O WhatsApp",
  website: "O site",
  instagram: "O Instagram",
  messenger: "O Messenger",
  telegram: "O Telegram",
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const reaisCurtos = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function nomeDoMes(mes: string, curto = false) {
  const nome = MESES[Number(mes.slice(5, 7)) - 1];
  return curto ? nome : `${nome}/${mes.slice(2, 4)}`;
}

/** Variação contra o mesmo trecho do mês anterior. Sem base para comparar, não mostra nada. */
function Variacao({ atual, anterior, pontos, escuro }: { atual: number; anterior: number; pontos?: boolean; escuro?: boolean }) {
  if (pontos ? false : anterior === 0) return null;
  const delta = pontos ? (atual - anterior) * 100 : ((atual - anterior) / anterior) * 100;
  const subiu = delta >= 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
          escuro ? "bg-inverse-fg/15" : subiu ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"
        )}
      >
        <Icone size={11} aria-hidden="true" />
        {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        {pontos ? " pt" : "%"}
      </span>
      <span className={escuro ? "opacity-70" : "text-text-tertiary"}>vs mês passado</span>
    </span>
  );
}

function Cartao({
  titulo, explicacao, valor, variacao, link, desenho, tom,
}: {
  titulo: string;
  explicacao: string;
  valor: string;
  variacao: React.ReactNode;
  link: { href: string; texto: string };
  desenho: React.ReactNode;
  tom: "escuro" | "claro" | "suave";
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        "flex min-h-[148px] flex-col rounded-[22px] p-5",
        tom === "escuro" && "bg-inverse text-inverse-fg",
        tom === "claro" && "border border-border-subtle bg-panel",
        tom === "suave" && "bg-raised"
      )}
    >
      <h3 className={cn("flex items-center gap-1 text-small", tom === "escuro" ? "opacity-80" : "text-text-secondary")}>
        {titulo}
        <Info size={12} aria-label={explicacao} className="opacity-60" role="img">
          <title>{explicacao}</title>
        </Info>
      </h3>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{valor}</p>
          {variacao}
        </div>
        <div className="shrink-0" aria-hidden="true">{desenho}</div>
      </div>
      <Link
        href={link.href}
        className={cn(
          "mt-auto pt-4 text-caption font-medium underline-offset-2 hover:underline",
          tom === "escuro" ? "text-inverse-fg/85" : "text-text-secondary"
        )}
      >
        {link.texto}
      </Link>
    </section>
  );
}

function Linha({ valores, escuro }: { valores: number[]; escuro?: boolean }) {
  const acumulado = valores.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []);
  const max = Math.max(1, ...acumulado);
  const n = Math.max(1, acumulado.length - 1);
  const pontos = acumulado.map((v, i) => `${(i / n) * 76 + 2},${38 - (v / max) * 34}`);
  return (
    <svg width="80" height="40" viewBox="0 0 80 40">
      <polyline points={pontos.join(" ")} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className={escuro ? "stroke-inverse-fg" : "stroke-accent-solid"} />
      {pontos.length > 0 && (
        <circle cx={pontos.at(-1)!.split(",")[0]} cy={pontos.at(-1)!.split(",")[1]} r="3.5" strokeWidth="2" className={escuro ? "fill-inverse stroke-inverse-fg" : "fill-panel stroke-accent-solid"} />
      )}
    </svg>
  );
}

function Barrinhas({ valores, escuro }: { valores: number[]; escuro?: boolean }) {
  const max = Math.max(1, ...valores);
  return (
    <div className="flex h-10 items-end gap-1">
      {valores.map((v, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          className={cn(
            "w-2.5 rounded-[4px]",
            i === valores.length - 1 ? (escuro ? "bg-inverse-fg" : "bg-accent-solid") : escuro ? "bg-inverse-fg/30" : "bg-text-tertiary/30"
          )}
        />
      ))}
    </div>
  );
}

function Anel({ parte }: { parte: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-text-tertiary/20" />
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-accent-solid" strokeDasharray={`${c * parte} ${c}`} />
      <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central" className="fill-current text-[10px] font-semibold">
        {Math.round(parte * 100)}%
      </text>
    </svg>
  );
}

/** Medidor em meia-lua com marcas, como um velocímetro. */
function Medidor({ pontos }: { pontos: number }) {
  const marcas = 25;
  const angulo = (p: number) => Math.PI * (1 - p / 100);
  const ponto = (p: number, raio: number) => [100 + raio * Math.cos(angulo(p)), 100 - raio * Math.sin(angulo(p))];
  const [kx, ky] = ponto(pontos, 78);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" aria-hidden="true">
      {Array.from({ length: marcas }, (_, i) => {
        const p = (i / (marcas - 1)) * 100;
        const [x1, y1] = ponto(p, 92);
        const [x2, y2] = ponto(p, i % 4 === 0 ? 84 : 87);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.5" strokeLinecap="round" className={p <= pontos ? "stroke-inverse-fg" : "stroke-inverse-fg/30"} />;
      })}
      <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-inverse-fg/15" />
      {pontos > 0 && <path d={`M 22 100 A 78 78 0 0 1 ${kx} ${ky}`} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-accent-solid" />}
      <circle cx={kx} cy={ky} r="9" className="fill-inverse stroke-inverse-fg" strokeWidth="3" />
    </svg>
  );
}

function Ritmo({ v }: { v: Visao }) {
  const r = v.ritmo;
  const daMedia = r.mediaMensal > 0 ? v.receita.atual / r.mediaMensal : null;
  const canal = r.melhorCanal ? ROTULO_DO_CANAL[r.melhorCanal.canal] ?? r.melhorCanal.canal : null;
  return (
    <section aria-label="Ritmo do mês" className="flex flex-col rounded-[22px] bg-inverse p-5 text-inverse-fg">
      <h3 className="flex items-center gap-1 text-small opacity-80">
        Ritmo do mês
        <Info size={12} role="img" aria-label="Receita do mês contra a média dos 3 meses anteriores." className="opacity-60">
          <title>Receita do mês contra a média dos 3 meses anteriores.</title>
        </Info>
      </h3>
      <div className="relative mx-auto mt-3 w-full max-w-[260px]">
        <Medidor pontos={r.pontos} />
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <p className="text-[34px] font-semibold leading-none tabular-nums">{r.pontos}</p>
          <p className="mt-1 text-caption opacity-70">de 100</p>
        </div>
      </div>
      <p className="mt-4 text-body font-medium">{r.mediaMensal === 0 ? "Primeiro mês com vendas" : r.noRitmo ? "Acima do ritmo" : "Abaixo do ritmo"}</p>
      <p className="mt-1 text-small leading-snug opacity-75">
        {daMedia !== null
          ? `${pct(daMedia)} da média mensal (${reaisCurtos(r.mediaMensal)}); até hoje o esperado era ${reaisCurtos(r.esperadoAteHoje)}.`
          : "Sem vendas nos 3 meses anteriores para comparar."}
        {canal && r.melhorCanal && ` ${canal} trouxe ${pct(r.melhorCanal.parte)} da receita.`}
      </p>
    </section>
  );
}

function ReceitaPorMes({ meses }: { meses: Mes[] }) {
  const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))];
  const [ano, setAno] = React.useState(anos.at(-1) ?? "");
  const [foco, setFoco] = React.useState<string | null>(null);
  const atual = meses.at(-1)?.mes ?? "";
  const doAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`).map(
    (mes) => meses.find((m) => m.mes === mes) ?? { mes, receita: 0, vendas: 0, criados: 0 }
  );
  const passados = doAno.filter((m) => m.mes <= atual);
  const max = Math.max(1, ...doAno.map((m) => m.receita));
  const media = passados.length ? passados.reduce((s, m) => s + m.receita, 0) / passados.length : 0;
  const total = passados.reduce((s, m) => s + m.receita, 0);
  const destaque = foco ?? (ano === atual.slice(0, 4) ? atual : null);

  return (
    <section aria-label="Receita por mês" className="flex min-w-0 flex-col rounded-[22px] border border-border-subtle bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-small text-text-secondary">
          Receita por mês <span className="ml-1 text-caption text-text-tertiary">{reais(total)} em {ano}</span>
        </h3>
        {anos.length > 1 && <SegmentedControl label="Ano" value={ano} onChange={setAno} options={anos.map((a) => ({ value: a, label: a }))} />}
      </div>
      <div className="relative mt-4 h-[220px]">
        {media > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text-tertiary/50" style={{ bottom: `${(media / max) * 88 + 8}%` }}>
            <span className="absolute -top-2.5 right-0 rounded-full bg-raised px-1.5 text-caption text-text-tertiary">média {reaisCurtos(media)}</span>
          </div>
        )}
        <div className="flex h-full items-end gap-1.5 sm:gap-2.5">
          {doAno.map((m) => {
            const futuro = m.mes > atual;
            const anterior = meses.find((x) => x.mes === `${Number(m.mes.slice(0, 4)) - 1}${m.mes.slice(4)}`);
            const ativo = destaque === m.mes;
            return (
              <div key={m.mes} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                {foco === m.mes && !futuro && (
                  <div role="status" className="absolute top-0 z-10 w-max rounded-[12px] bg-inverse px-3 py-2 text-caption text-inverse-fg shadow-lg">
                    <p className="mb-1 font-medium">{nomeDoMes(m.mes)}</p>
                    <p className="flex justify-between gap-4"><span className="opacity-70">Receita</span>{reais(m.receita)}</p>
                    <p className="flex justify-between gap-4"><span className="opacity-70">Vendas</span>{m.vendas}</p>
                    {anterior && anterior.receita > 0 && (
                      <p className="flex justify-between gap-4">
                        <span className="opacity-70">vs ano anterior</span>
                        {m.receita >= anterior.receita ? "+" : ""}
                        {pct((m.receita - anterior.receita) / anterior.receita)}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={futuro}
                  aria-label={futuro ? `${nomeDoMes(m.mes)}: ainda não chegou` : `${nomeDoMes(m.mes)}: ${reais(m.receita)}, ${m.vendas} vendas`}
                  onMouseEnter={() => setFoco(m.mes)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(m.mes)}
                  onBlur={() => setFoco(null)}
                  style={{ height: `${futuro ? 40 : Math.max(6, (m.receita / max) * 88)}%` }}
                  className={cn(
                    "w-full max-w-[44px] rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    futuro
                      ? "border border-dashed border-text-tertiary/50"
                      : ativo
                        ? "bg-gradient-to-b from-accent-solid to-accent-solid/60"
                        : "bg-[repeating-linear-gradient(135deg,var(--color-border-default)_0_2px,transparent_2px_6px)] outline outline-1 -outline-offset-1 outline-border-default"
                  )}
                />
                <span className={cn("text-caption", ativo ? "font-semibold text-text-primary" : "text-text-tertiary")}>{nomeDoMes(m.mes, true)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MapaDeCalor({ calor }: { calor: number[][] }) {
  const max = Math.max(1, ...calor.flat());
  const tom = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const classes = ["bg-raised", "bg-accent-solid/20", "bg-accent-solid/40", "bg-accent-solid/70", "bg-accent-solid"];
  // Segunda a domingo, como na agenda.
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return (
    <section aria-label="Quando os clientes escrevem" className="rounded-[22px] border border-border-subtle bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-small text-text-secondary">
          Quando os clientes escrevem <span className="ml-1 text-caption text-text-tertiary">últimos 30 dias</span>
        </h3>
        <div className="flex items-center gap-1 text-caption text-text-tertiary" aria-hidden="true">
          0 {classes.map((c) => <span key={c} className={cn("size-3 rounded-[4px]", c)} />)} {max}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[36px_repeat(7,minmax(0,1fr))] gap-1 text-caption">
        <span />
        {ordem.map((d) => <span key={d} className="text-center text-text-tertiary">{DIAS[d]}</span>)}
        {Array.from({ length: 12 }, (_, b) => (
          <React.Fragment key={b}>
            <span className="pr-1 text-right font-mono text-text-tertiary">{String(b * 2).padStart(2, "0")}h</span>
            {ordem.map((d) => (
              <span
                key={d}
                title={`${DIAS[d]}, ${b * 2}h–${b * 2 + 2}h: ${calor[d][b]} mensagens`}
                className={cn("h-5 rounded-[5px]", classes[tom(calor[d][b])])}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

export function VisaoGeral() {
  const [canal, setCanal] = React.useState("");
  const [v, setV] = React.useState<Visao | null>(null);
  const [erro, setErro] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/dashboard/overview?channel=${canal}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!vivo) return;
        setV(d);
        setErro(false);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [canal]);

  const mesAtual = v ? new Date(`${v.periodo.ate}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Canal"
          value={canal}
          onChange={setCanal}
          options={[{ value: "", label: "Geral" }, ...(v?.canaisComDados ?? []).map((g) => ({ value: g, label: ROTULO_DO_GRUPO[g] ?? g }))]}
        />
        {v && <span className="text-small text-text-tertiary first-letter:uppercase">{mesAtual}, até hoje</span>}
        {v && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-panel px-3 py-1 text-small tabular-nums">
            <span className={cn("size-2 rounded-full", v.aoVivo > 0 ? "bg-success" : "bg-text-tertiary/50")} aria-hidden="true" />
            {v.aoVivo} {v.aoVivo === 1 ? "conversa agora" : "conversas agora"}
          </span>
        )}
      </div>

      {erro && <p role="alert" className="text-small text-danger">Não foi possível carregar a visão geral.</p>}

      {!v ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[148px] animate-pulse rounded-[22px] bg-raised motion-reduce:animate-none" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Cartao
              tom="escuro"
              titulo="Receita"
              explicacao="Negócios ganhos no mês, somados. A linha é a receita acumulada dia a dia."
              valor={reais(v.receita.atual)}
              variacao={<Variacao atual={v.receita.atual} anterior={v.receita.anterior} escuro />}
              link={{ href: "/deals", texto: "Ver negócios" }}
              desenho={<Linha valores={v.receita.porDia} escuro />}
            />
            <Cartao
              tom="claro"
              titulo="Vendas"
              explicacao="Quantos negócios foram ganhos no mês. As barras são as semanas."
              valor={v.vendas.atual.toLocaleString("pt-BR")}
              variacao={<Variacao atual={v.vendas.atual} anterior={v.vendas.anterior} />}
              link={{ href: "/deals", texto: "Ver funil" }}
              desenho={<Barrinhas valores={v.vendas.porSemana} />}
            />
            <Cartao
              tom="suave"
              titulo="Conversas"
              explicacao="Conversas novas no mês. O anel mostra quantas terminaram sem precisar de atendente."
              valor={v.conversas.atual.toLocaleString("pt-BR")}
              variacao={<Variacao atual={v.conversas.atual} anterior={v.conversas.anterior} />}
              link={{ href: "/conversations", texto: "Ver conversas" }}
              desenho={v.conversas.semAtendente !== null ? <Anel parte={v.conversas.semAtendente} /> : null}
            />
            <Cartao
              tom="suave"
              titulo="Conversão"
              explicacao="Negócios ganhos sobre negócios criados no mês. As barras são os últimos 6 meses."
              valor={v.conversao.atual !== null ? pct(v.conversao.atual) : "—"}
              variacao={
                v.conversao.atual !== null && v.conversao.anterior !== null ? (
                  <Variacao atual={v.conversao.atual} anterior={v.conversao.anterior} pontos />
                ) : null
              }
              link={{ href: "/deals", texto: "Ver negócios" }}
              desenho={<Barrinhas valores={v.conversao.porMes.map((m) => m.valor ?? 0)} />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
            <Ritmo v={v} />
            <ReceitaPorMes key={v.canal} meses={v.meses} />
          </div>

          <MapaDeCalor calor={v.calor} />
        </>
      )}
    </div>
  );
}
