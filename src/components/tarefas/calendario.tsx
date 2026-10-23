"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { AlarmClock, CalendarCheck, ChevronLeft, ChevronRight, HandCoins, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";
import { diaDaSemana, diaEmSP, mesmoDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import type { VisaoDeTarefas } from "@/lib/tarefas/escopo";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import {
  NOMES_DOS_MESES,
  agruparPorDia,
  chaveDoDia,
  eventosDasTarefas,
  eventosDosNegocios,
  resumirDia,
  somarMeses,
  type EventoDoCalendario,
  type Mes,
  type NegocioComPrevisao,
} from "./calendario-dados";
import { avisosDoCalendario, diasDaSemana, eventoEmDestaque, intervaloDaVisao, paraAvisarNaIlha, type AvisoDoCalendario } from "./calendario-semana";
import { valorCurto } from "@/components/crm/negocios/modelo";
import { usePreferencia } from "@/components/crm/negocios/use-preferencia";
import { buscarTarefas, FiltroDeQuem, type Resposta } from "./lista";
import { useConcluirTarefa } from "./concluir";
import type { Moldura } from "./pecas";
import { MiniMes } from "./mini-mes";
import { faixaDeHorario, GradeDaSemana } from "./semana";
import { GradeDoMes } from "./mes";
import { AgendaDoDia } from "./agenda-do-dia";
import { DetalheDoEvento } from "./detalhe-do-evento";

// Calendário (terceira aba de Tarefas, e bloco do Início). No desenho da
// agenda de trabalho: em cima, o dia escolhido, a navegação e os avisos
// (atrasadas, próximo compromisso, fechamentos da semana); à esquerda, o mini
// calendário, a agenda do dia e o detalhe do item escolhido; à direita, a
// semana em grade de horas (padrão) ou o mês. Clicar num dia ou num item, em
// qualquer lugar, leva a esquerda para ele. Tudo no relógio de SP.
//
// Os dados chegam como EventoDoCalendario (calendario-dados.ts). Fontes: as
// tarefas com prazo e os fechamentos previstos dos negócios abertos, no
// intervalo do mês e da semana escolhidos; a agenda espelhada (Google/Outlook)
// entraria como mais uma fonte em `eventos` abaixo, sem mexer nas grades nem
// no detalhe.

// Mola curta: a semana/o mês desliza para o lado da navegação e esmaece.
const MOLA: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.8 };
const ESMAECER: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

/** Negócios por página e páginas no máximo por intervalo (POST /api/deals/busca). */
const NEGOCIOS_POR_PAGINA = 100;
const PAGINAS_DE_NEGOCIOS = 5;

const MODOS = ["semana", "mes"] as const;
type ModoDoCalendario = (typeof MODOS)[number];
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;
const DIAS_DA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"] as const;

/** Compromissos já avisados na ilha nesta aba (o Início e Tarefas não avisam duas vezes). */
const AVISADOS_NA_ILHA = new Set<string>();

/**
 * Negócios abertos com previsão de fechamento no intervalo, pela busca da
 * lista de Negócios (filtro e escopo do servidor). "Minhas" mostra só os de
 * quem está vendo; equipe e todas mostram os que a pessoa pode ver.
 */
async function buscarFechamentos(intervalo: { de: string; ate: string }, meuId: string | null): Promise<NegocioComPrevisao[] | null> {
  const rapidos: unknown[] = [
    { campo: "tipoEtapa", op: "qualquer", valores: ["open"] },
    { campo: "previsao", op: "entre", valor: intervalo.de, ate: intervalo.ate },
  ];
  if (meuId) rapidos.push({ campo: "responsavel", op: "qualquer", valores: [meuId] });
  const todos: NegocioComPrevisao[] = [];
  try {
    for (let page = 1; page <= PAGINAS_DE_NEGOCIOS; page++) {
      const res = await fetch("/api/deals/busca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtro: { rapidos }, sort: "previsao", dir: "asc", page, pageSize: NEGOCIOS_POR_PAGINA }),
      });
      if (!res.ok) return null;
      const d = (await res.json()) as { deals?: NegocioComPrevisao[]; total?: number };
      const pagina = d.deals ?? [];
      todos.push(...pagina);
      if (todos.length >= (d.total ?? 0) || pagina.length < NEGOCIOS_POR_PAGINA) break;
    }
    return todos;
  } catch {
    return null;
  }
}

export function Calendario({ versao, onMudou, moldura }: { versao: number; onMudou: () => void; moldura: Moldura }) {
  const toast = useToast();
  const reduzir = useReducedMotion();
  const [visao, setVisao] = React.useState<VisaoDeTarefas>("minhas");
  const [visoes, setVisoes] = React.useState<VisaoDeTarefas[]>(["minhas"]);
  const [tarefas, setTarefas] = React.useState<TarefaDaTela[] | null>(null);
  const [negocios, setNegocios] = React.useState<NegocioComPrevisao[]>([]);
  // Quem está vendo (para "Minhas" nos fechamentos): undefined enquanto carrega.
  const [meuId, setMeuId] = React.useState<string | null | undefined>(undefined);
  const [erro, setErro] = React.useState<string | null>(null);
  const [agora, setAgora] = React.useState(() => new Date());
  // Semana ou mês: lembrado no navegador.
  const [modo, trocarModo] = usePreferencia<ModoDoCalendario>("eva.calendario.modo", "semana", MODOS);
  // Dia escolhido: a semana dele, o mês dele, a agenda e o detalhe partem daqui.
  const [dia, setDia] = React.useState<Dia>(() => diaEmSP(new Date()));
  const [mesDoMini, setMesDoMini] = React.useState<Mes>(() => {
    const d = diaEmSP(new Date());
    return { ano: d.ano, mes: d.mes };
  });
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
  const [direcao, setDirecao] = React.useState(0);

  // O "agora" anda sozinho (linha da hora, "em 10 min", aviso na ilha).
  React.useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const aplicar = React.useCallback(
    (r: Resposta) => {
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setTarefas(r.dados.tasks ?? []);
      setVisoes(r.dados.visoes ?? ["minhas"]);
      if (r.dados.visao && r.dados.visao !== visao) setVisao(r.dados.visao);
      setAgora(new Date());
    },
    [visao]
  );

  // A grade do mês do dia escolhido mais a semana dele (abertas e feitas).
  const { de, ate } = intervaloDaVisao(dia);
  const carregar = React.useCallback(() => buscarTarefas(visao, { de, ate }).then(aplicar), [visao, de, ate, aplicar]);

  React.useEffect(() => {
    let vivo = true;
    buscarTarefas(visao, { de, ate }).then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [visao, de, ate, versao, aplicar]);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/members")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && setMeuId(d?.me?.userId ?? null))
      .catch(() => vivo && setMeuId(null));
    return () => {
      vivo = false;
    };
  }, []);

  // Fechamentos previstos: falhar aqui não derruba o calendário (só somem).
  React.useEffect(() => {
    if (meuId === undefined) return;
    let vivo = true;
    buscarFechamentos({ de, ate }, visao === "minhas" ? meuId : null).then((lista) => vivo && setNegocios(lista ?? []));
    return () => {
      vivo = false;
    };
  }, [de, ate, visao, meuId, versao]);

  const mudou = React.useCallback(() => {
    carregar();
    onMudou();
  }, [carregar, onMudou]);

  const origemDoPulso = React.useRef<HTMLElement | null>(null);
  const { abrir, dialogo } = useConcluirTarefa(() => {
    pulsar(origemDoPulso.current, 1.2);
    mudou();
  });
  const concluir = (t: TarefaDaTela, el?: HTMLElement) => {
    origemDoPulso.current = el ?? null;
    abrir(t);
  };

  async function reabrir(t: TarefaDaTela) {
    const res = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: false }) });
    if (!res.ok) toast({ title: "Não foi possível reabrir.", tone: "danger" });
    mudou();
  }

  // Fontes do calendário. Agenda externa: concatenar aqui os eventos dela
  // (origem "agenda") quando a integração existir.
  const eventos = React.useMemo<EventoDoCalendario[]>(
    () => (tarefas ? [...eventosDasTarefas(tarefas, agora), ...eventosDosNegocios(negocios)] : []),
    [tarefas, negocios, agora]
  );
  const porDia = React.useMemo(() => agruparPorDia(eventos), [eventos]);
  const comEventos = React.useMemo(() => new Set(porDia.keys()), [porDia]);
  const semana = React.useMemo(() => diasDaSemana(dia), [dia]);
  const hoje = diaEmSP(agora);

  // Esquerda: a agenda do dia escolhido e o item em destaque (o clicado; sem
  // clique, o próximo do dia).
  const doDia = porDia.get(chaveDoDia(dia)) ?? [];
  const selecionado = (selecionadoId ? eventos.find((e) => e.id === selecionadoId) : null) ?? eventoEmDestaque(doDia, agora);
  const avisos = tarefas ? avisosDoCalendario(eventos, semana, agora) : [];

  /** Escolhe um dia: a semana/o mês vão para ele, deslizando para o lado certo. */
  function escolherDia(d: Dia, itemId: string | null = null) {
    const chave = (x: Dia) => (modo === "semana" ? chaveDoDia(diasDaSemana(x)[0]) : chaveDoDia({ ano: x.ano, mes: x.mes, dia: 1 }));
    const antes = chave(dia);
    const depois = chave(d);
    if (antes !== depois) setDirecao(depois > antes ? 1 : -1);
    setDia(d);
    setMesDoMini({ ano: d.ano, mes: d.mes });
    setSelecionadoId(itemId);
  }
  const escolherEvento = (e: EventoDoCalendario) => escolherDia(diaEmSP(e.inicio), e.id);
  function andar(n: number) {
    if (modo === "semana") return escolherDia(somarDias(dia, 7 * n));
    const m = somarMeses({ ano: dia.ano, mes: dia.mes }, n);
    escolherDia({ ano: m.ano, mes: m.mes, dia: 1 });
  }

  // Aviso na ilha 10 minutos antes de cada compromisso (uma vez por item).
  const escolherEventoRef = React.useRef(escolherEvento);
  React.useEffect(() => {
    escolherEventoRef.current = escolherEvento;
  });
  React.useEffect(() => {
    for (const e of paraAvisarNaIlha(eventos, agora, AVISADOS_NA_ILHA)) {
      AVISADOS_NA_ILHA.add(e.id);
      const min = Math.max(1, Math.round((e.inicio.getTime() - agora.getTime()) / 60_000));
      avisarNaIlha({
        titulo: `${e.titulo} em ${min} min`,
        detalhe: [faixaDeHorario(e), e.tarefa?.contact?.name ?? e.tarefa?.deal?.name].filter(Boolean).join(" · "),
        duracao: 8000,
        acao: { rotulo: "Ver", aoClicar: () => escolherEventoRef.current(e) },
      });
    }
  }, [eventos, agora]);

  // Atalhos: PageUp/PageDown andam uma semana/um mês (fora de campo).
  const andarRef = React.useRef(andar);
  React.useEffect(() => {
    andarRef.current = andar;
  });
  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        andarRef.current(e.key === "PageDown" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Contagem do mês (ao lado do título da tela).
  const doMes = React.useMemo(() => {
    const lista = eventos.filter((e) => {
      const d = diaEmSP(e.inicio);
      return d.ano === dia.ano && d.mes === dia.mes;
    });
    return resumirDia(lista);
  }, [eventos, dia.ano, dia.mes]);

  const contagem =
    tarefas === null ? null : (
      <>
        {doMes.tarefas} {doMes.tarefas === 1 ? "aberta" : "abertas"} no mês
        {doMes.fechamentos > 0 && (
          <>
            {" "}
            · {doMes.fechamentos} {doMes.fechamentos === 1 ? "fechamento previsto" : "fechamentos previstos"} ({valorCurto(doMes.valorCents)})
          </>
        )}
        {doMes.atrasadas > 0 && (
          <span className="text-danger">
            {" "}
            · {doMes.atrasadas} atrasada{doMes.atrasadas === 1 ? "" : "s"}
          </span>
        )}
      </>
    );

  const variantes: Variants = {
    entra: (d: number) => ({ opacity: 0, x: reduzir ? 0 : d * 56, filter: reduzir ? "blur(0px)" : "blur(6px)" }),
    centro: { opacity: 1, x: 0, filter: "blur(0px)" },
    sai: (d: number) => ({ opacity: 0, x: reduzir ? 0 : d * -56, filter: reduzir ? "blur(0px)" : "blur(6px)" }),
  };
  const chaveDaGrade = modo === "semana" ? `s-${chaveDoDia(semana[0])}` : `m-${dia.ano}-${dia.mes}`;

  return moldura({
    contagem,
    lateral: <FiltroDeQuem visoes={visoes} visao={visao} onEscolher={setVisao} />,
    conteudo: (
      <div className="overflow-hidden rounded-[22px] border border-border-subtle bg-panel">
        {/* Cabeçalho: o dia escolhido, os avisos e a navegação. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border-subtle px-5 py-4">
          <div aria-hidden="true" className="flex w-12 flex-col overflow-hidden rounded-[10px] border border-border-subtle text-center shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
            <span className="bg-danger-solid py-0.5 text-[10px] font-semibold tracking-widest text-text-on-accent">{MESES_CURTOS[dia.mes - 1]}</span>
            <span className="bg-panel py-1 text-title font-semibold leading-none tabular-nums text-text-primary">{dia.dia}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-body font-semibold text-text-primary" aria-live="polite">
              {dia.dia} de {NOMES_DOS_MESES[dia.mes - 1].toLowerCase()} de {dia.ano}
            </h2>
            <p className="text-small text-text-tertiary">{DIAS_DA_SEMANA[diaDaSemana(dia)]}</p>
          </div>

          {avisos.length > 0 && (
            <ul aria-label="Avisos" className="flex min-w-0 flex-wrap items-center gap-2">
              {avisos.map((a) => {
                const alvo = a.eventoId ? eventos.find((e) => e.id === a.eventoId) : null;
                return (
                  <li key={a.id}>
                    <PilulaDeAviso aviso={a} onClick={alvo ? () => escolherEvento(alvo) : undefined} />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex h-9 items-center rounded-full border border-border-subtle bg-raised p-0.5">
              <IconButton aria-label={modo === "semana" ? "Semana anterior" : "Mês anterior"} tooltip="PageUp" size="sm" onClick={() => andar(-1)}>
                <ChevronLeft />
              </IconButton>
              <Button variant="ghost" size="sm" className="h-8 rounded-full px-4" onClick={() => escolherDia(hoje)} disabled={mesmoDia(dia, hoje) && !selecionadoId}>
                Hoje
              </Button>
              <IconButton aria-label={modo === "semana" ? "Próxima semana" : "Próximo mês"} tooltip="PageDown" size="sm" onClick={() => andar(1)}>
                <ChevronRight />
              </IconButton>
            </div>
            <SegmentedControl
              label="Visão do calendário"
              value={modo}
              onChange={trocarModo}
              options={[
                { value: "semana", label: "Semana" },
                { value: "mes", label: "Mês" },
              ]}
            />
          </div>
        </div>

        {erro && (
          <p role="alert" className="px-5 pt-3 text-small text-danger">
            {erro}
          </p>
        )}

        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Esquerda: mini mês, agenda do dia e o detalhe do item escolhido. */}
          <aside aria-label="Mês, agenda do dia e detalhe" className="flex flex-col gap-5 border-b border-border-subtle p-5 lg:border-b-0 lg:border-r">
            <MiniMes mes={mesDoMini} onMes={setMesDoMini} escolhido={dia} hoje={hoje} comEventos={comEventos} onEscolher={(d) => escolherDia(d)} />
            {tarefas === null ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : (
              <>
                <div className="border-t border-border-subtle pt-4">
                  <AgendaDoDia dia={dia} eventos={doDia} selecionadoId={selecionado?.id ?? null} onEscolher={escolherEvento} />
                </div>
                <div className="rounded-[16px] border border-border-subtle bg-raised/50 p-4">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={selecionado?.id ?? "vazio"}
                      initial={{ opacity: 0, y: reduzir ? 0 : 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: reduzir ? 0 : -4 }}
                      transition={{ duration: 0.16 }}
                    >
                      <DetalheDoEvento evento={selecionado} agora={agora} onConcluir={concluir} onReabrir={reabrir} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </>
            )}
          </aside>

          {/* Direita: semana (padrão) ou mês. */}
          <div className="min-w-0">
            {tarefas === null ? (
              <div className="grid grid-cols-7 gap-2 p-4" aria-busy="true">
                {Array.from({ length: 21 }, (_, i) => (
                  <Skeleton key={i} className="h-24 rounded-[14px]" />
                ))}
              </div>
            ) : (
              <div className="relative overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
                  <motion.div
                    key={chaveDaGrade}
                    custom={direcao}
                    variants={variantes}
                    initial="entra"
                    animate="centro"
                    exit="sai"
                    transition={{ x: MOLA, opacity: ESMAECER, filter: ESMAECER }}
                  >
                    {modo === "semana" ? (
                      <GradeDaSemana
                        dias={semana}
                        porDia={porDia}
                        hoje={hoje}
                        agora={agora}
                        escolhido={dia}
                        selecionadoId={selecionado?.id ?? null}
                        onEscolherDia={(d) => escolherDia(d)}
                        onEscolherEvento={escolherEvento}
                      />
                    ) : (
                      <GradeDoMes
                        dia={dia}
                        porDia={porDia}
                        hoje={hoje}
                        selecionadoId={selecionado?.id ?? null}
                        onEscolherDia={(d) => escolherDia(d)}
                        onEscolherEvento={escolherEvento}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        {dialogo}
      </div>
    ),
  });
}

const ICONE_DO_AVISO = { atrasadas: TriangleAlert, proximo: AlarmClock, fechamentos: HandCoins, livre: CalendarCheck } as const;
const TOM_DO_AVISO = {
  perigo: "bg-danger-subtle text-danger",
  aviso: "bg-warning-subtle text-warning",
  sucesso: "bg-success-subtle text-success",
  normal: "bg-raised text-text-secondary",
} as const;

function PilulaDeAviso({ aviso, onClick }: { aviso: AvisoDoCalendario; onClick?: () => void }) {
  const Icone = ICONE_DO_AVISO[aviso.id];
  const classe = cn("inline-flex h-7 max-w-[320px] items-center gap-1.5 rounded-full px-3 text-caption font-medium", TOM_DO_AVISO[aviso.tom]);
  if (!onClick)
    return (
      <span className={classe}>
        <Icone size={13} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{aviso.texto}</span>
      </span>
    );
  return (
    <button type="button" onClick={onClick} className={cn(classe, "transition-[filter] duration-150 hover:brightness-95", focusRing)}>
      <Icone size={13} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{aviso.texto}</span>
    </button>
  );
}
