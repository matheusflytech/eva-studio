"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, HandCoins } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { focusRing } from "@/components/ui/styles";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import { pulsar } from "@/lib/fundo/eventos";
import { diaDaSemana, diaEmSP, mesmoDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import type { VisaoDeTarefas } from "@/lib/tarefas/escopo";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import {
  NOMES_DOS_MESES,
  SEMANA_CURTA,
  agruparPorDia,
  chaveDoDia,
  densidade,
  diaDaChave,
  eventosDasTarefas,
  eventosDosNegocios,
  horaDoEvento,
  partesDoResumo,
  resumirDia,
  semanasDoMes,
  somarMeses,
  textoDoResumo,
  tituloDoDia,
  type EventoDoCalendario,
  type Mes,
  type NegocioComPrevisao,
} from "./calendario-dados";
import { diasDaSemana, eventoEmDestaque, intervaloDaVisao } from "./calendario-semana";
import { valorCurto } from "@/components/crm/negocios/modelo";
import { usePreferencia } from "@/components/crm/negocios/use-preferencia";
import { buscarTarefas, FiltroDeQuem, type Resposta } from "./lista";
import { LinhaDeTarefa } from "./linha";
import { useConcluirTarefa } from "./concluir";
import { BlocoDeHorario, IconeDoTipo, SemTarefas, TituloDeGrupo, type Moldura } from "./pecas";
import { MiniMes } from "./mini-mes";
import { GradeDaSemana } from "./semana";
import { DetalheDoEvento } from "./detalhe-do-evento";

// Calendário (terceira aba de Tarefas, e bloco do Início). No desenho da
// agenda de trabalho: em cima, o dia escolhido e a navegação; à esquerda, o
// mini calendário do mês e o detalhe do item escolhido (quando, a que negócio
// e contato está ligado, concluir); à direita, a semana em grade de horas
// (padrão) ou o mês em grade de cartões. Tudo no relógio de SP.
//
// Os dados chegam como EventoDoCalendario (calendario-dados.ts). Fontes: as
// tarefas com prazo e os fechamentos previstos dos negócios abertos, no
// intervalo do mês e da semana escolhidos; a agenda espelhada (Google/Outlook)
// entraria como mais uma fonte em `eventos` abaixo, sem mexer nas grades nem
// no detalhe.

/** Eventos listados dentro do cartão do dia (visão do mês) antes do "+N". */
const NO_CARTAO = 3;

// Mola curta: a semana/o mês desliza para o lado da navegação e esmaece.
const MOLA: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.8 };
const ESMAECER: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

const TINTA = ["", "bg-accent-subtle/40", "bg-accent-subtle/70", "bg-accent-subtle"] as const;

/** Faixa dos fechamentos previstos (cor de dado, não de estado). */
const FAIXA_DO_FECHAMENTO = CATEGORY_CLASSES.green.solid;

/** Negócios por página e páginas no máximo por intervalo (POST /api/deals/busca). */
const NEGOCIOS_POR_PAGINA = 100;
const PAGINAS_DE_NEGOCIOS = 5;

const MODOS = ["semana", "mes"] as const;
type ModoDoCalendario = (typeof MODOS)[number];
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;
const DIAS_DA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"] as const;

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
  // Dia escolhido: a semana dele, o mês dele e o detalhe partem daqui.
  const [dia, setDia] = React.useState<Dia>(() => diaEmSP(new Date()));
  const [mesDoMini, setMesDoMini] = React.useState<Mes>(() => {
    const d = diaEmSP(new Date());
    return { ano: d.ano, mes: d.mes };
  });
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
  const [direcao, setDirecao] = React.useState(0);
  const [aberto, setAberto] = React.useState<string | null>(null);

  // O "agora" anda sozinho (linha da hora na semana, "em 10 min" no detalhe).
  React.useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
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
  // (origem "agenda") quando a integração existir. Sem agenda conectada não
  // há botão de conectar (o recurso ainda não existe).
  const eventos = React.useMemo<EventoDoCalendario[]>(
    () => (tarefas ? [...eventosDasTarefas(tarefas, agora), ...eventosDosNegocios(negocios)] : []),
    [tarefas, negocios, agora]
  );
  const porDia = React.useMemo(() => agruparPorDia(eventos), [eventos]);
  const comEventos = React.useMemo(() => new Set(porDia.keys()), [porDia]);
  const semanas = React.useMemo(() => semanasDoMes({ ano: dia.ano, mes: dia.mes }), [dia.ano, dia.mes]);
  const semana = React.useMemo(() => diasDaSemana(dia), [dia]);
  const hoje = diaEmSP(agora);

  // Detalhe: o item clicado; sem clique, o próximo do dia escolhido.
  const doDia = porDia.get(chaveDoDia(dia)) ?? [];
  const selecionado = (selecionadoId ? eventos.find((e) => e.id === selecionadoId) : null) ?? eventoEmDestaque(doDia, agora);

  /** Escolhe um dia: a semana/o mês vão para ele, deslizando para o lado certo. */
  function escolherDia(d: Dia) {
    const chave = (x: Dia) => (modo === "semana" ? chaveDoDia(diasDaSemana(x)[0]) : chaveDoDia({ ano: x.ano, mes: x.mes, dia: 1 }));
    const antes = chave(dia);
    const depois = chave(d);
    if (antes !== depois) setDirecao(depois > antes ? 1 : -1);
    setDia(d);
    setMesDoMini({ ano: d.ano, mes: d.mes });
    setSelecionadoId(null);
  }
  function andar(n: number) {
    if (modo === "semana") return escolherDia(somarDias(dia, 7 * n));
    const m = somarMeses({ ano: dia.ano, mes: dia.mes }, n);
    escolherDia({ ano: m.ano, mes: m.mes, dia: 1 });
  }

  // Atalhos: PageUp/PageDown andam uma semana/um mês (fora de campo e com o painel fechado).
  const andarRef = React.useRef(andar);
  React.useEffect(() => {
    andarRef.current = andar;
  });
  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (aberto || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        andarRef.current(e.key === "PageDown" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

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

  const diaAberto = aberto ? diaDaChave(aberto) : null;
  const eventosDoDia = aberto ? (porDia.get(aberto) ?? []) : [];
  const abertosDoDia = eventosDoDia.filter((e) => !e.feita);
  const feitosDoDia = eventosDoDia.filter((e) => e.feita);

  return moldura({
    contagem,
    lateral: <FiltroDeQuem visoes={visoes} visao={visao} onEscolher={setVisao} />,
    conteudo: (
      <div className="overflow-hidden rounded-[22px] border border-border-subtle bg-panel">
        {/* Cabeçalho: o dia escolhido e a navegação. */}
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

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex h-9 items-center rounded-full border border-border-subtle bg-raised p-0.5">
              <IconButton aria-label={modo === "semana" ? "Semana anterior" : "Mês anterior"} tooltip="PageUp" size="sm" onClick={() => andar(-1)}>
                <ChevronLeft />
              </IconButton>
              <Button variant="ghost" size="sm" className="h-8 rounded-full px-4" onClick={() => escolherDia(hoje)} disabled={mesmoDia(dia, hoje)}>
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

        <div className="grid lg:grid-cols-[288px_minmax(0,1fr)]">
          {/* Esquerda: mini mês e o detalhe do item escolhido. */}
          <aside aria-label="Mês e detalhe" className="flex flex-col gap-5 border-b border-border-subtle p-5 lg:border-b-0 lg:border-r">
            <MiniMes mes={mesDoMini} onMes={setMesDoMini} escolhido={dia} hoje={hoje} comEventos={comEventos} onEscolher={escolherDia} />
            <div className="border-t border-border-subtle pt-5">
              {tarefas === null ? <Skeleton className="h-40 rounded-2xl" /> : <DetalheDoEvento evento={selecionado} agora={agora} onConcluir={concluir} onReabrir={reabrir} />}
            </div>
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
                        onEscolherDia={escolherDia}
                        onEscolherEvento={(e) => {
                          setDia(diaEmSP(e.inicio));
                          setSelecionadoId(e.id);
                        }}
                      />
                    ) : (
                      <div className="flex flex-col gap-2 p-4">
                        <div className="grid grid-cols-7 gap-2" aria-hidden="true">
                          {SEMANA_CURTA.map((d) => (
                            <span key={d} className="grid h-8 place-items-center rounded-full border border-border-subtle bg-raised font-mono text-caption tracking-widest text-text-tertiary">
                              {d}
                            </span>
                          ))}
                        </div>
                        <div role="group" aria-label={`${NOMES_DOS_MESES[dia.mes - 1]} de ${dia.ano}`} className="grid w-full grid-cols-7 gap-2" style={{ gridAutoRows: "minmax(120px, 1fr)" }}>
                          {semanas.flat().map((d) => {
                            const chave = chaveDoDia(d);
                            return (
                              <DiaDoCalendario
                                key={chave}
                                dia={d}
                                eventos={porDia.get(chave) ?? []}
                                foraDoMes={d.mes !== dia.mes}
                                ehHoje={mesmoDia(d, hoje)}
                                onAbrir={() => setAberto(chave)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        <Drawer open={!!aberto} onOpenChange={(a) => !a && setAberto(null)}>
          {diaAberto && (
            <DrawerContent
              size="lg"
              title={primeiraMaiuscula(tituloDoDia(diaAberto))}
              description={eventosDoDia.length ? textoDoResumo(resumirDia(eventosDoDia)) : undefined}
            >
              {eventosDoDia.length === 0 ? (
                <SemTarefas texto="Nada marcado para este dia." />
              ) : (
                <div className="flex flex-col gap-6">
                  {abertosDoDia.length > 0 && <ListaDoDia eventos={abertosDoDia} agora={agora} onConcluir={concluir} onReabrir={reabrir} onMudou={mudou} />}
                  {feitosDoDia.length > 0 && (
                    <section aria-labelledby="dia-feitas">
                      <TituloDeGrupo id="dia-feitas">Concluídas</TituloDeGrupo>
                      <ListaDoDia eventos={feitosDoDia} agora={agora} onConcluir={concluir} onReabrir={reabrir} onMudou={mudou} />
                    </section>
                  )}
                </div>
              )}
            </DrawerContent>
          )}
        </Drawer>
        {dialogo}
      </div>
    ),
  });
}

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tarefa vira a linha de tarefa de sempre; fechamento leva à ficha; evento de agenda vira o bloco com faixa de cor e hora. */
function ListaDoDia({
  eventos,
  agora,
  onConcluir,
  onReabrir,
  onMudou,
}: {
  eventos: EventoDoCalendario[];
  agora: Date;
  onConcluir: (t: TarefaDaTela, el?: HTMLElement) => void;
  onReabrir: (t: TarefaDaTela) => void;
  onMudou: () => void;
}) {
  return (
    <ul className="flex flex-col">
      {eventos.map((e) =>
        e.tarefa ? (
          <LinhaDeTarefa key={e.id} tarefa={e.tarefa} agora={agora} onConcluir={onConcluir} onReabrir={onReabrir} onMudou={onMudou} />
        ) : e.negocio ? (
          <li key={e.id} className="py-0.5">
            <Link href={`/negocios/${e.negocio.id}`} className={cn("block rounded-[14px]", focusRing)} aria-label={`Abrir o negócio ${e.titulo}`}>
              <BlocoDeHorario
                hora="prev."
                titulo={e.titulo}
                detalhe={[valorCurto(e.negocio.valorCents), e.negocio.etapa, e.negocio.empresa].filter(Boolean).join(" · ")}
                faixa={FAIXA_DO_FECHAMENTO}
              />
            </Link>
          </li>
        ) : (
          <li key={e.id} className="py-0.5">
            <BlocoDeHorario
              hora={e.diaTodo ? "dia" : horaDoEvento(e)}
              fim={e.fim && !e.diaTodo ? horaDoEvento({ ...e, inicio: e.fim }) : null}
              titulo={e.titulo}
              tipo={e.tipo}
              faixa={e.cor ? CATEGORY_CLASSES[e.cor].solid : undefined}
              tom={e.feita ? "feita" : "normal"}
            />
          </li>
        )
      )}
    </ul>
  );
}

function DiaDoCalendario({
  dia,
  eventos,
  foraDoMes,
  ehHoje,
  onAbrir,
}: {
  dia: Dia;
  eventos: EventoDoCalendario[];
  foraDoMes: boolean;
  ehHoje: boolean;
  onAbrir: () => void;
}) {
  const resumo = resumirDia(eventos);
  const nivel = densidade(resumo);
  const visiveis = eventos.slice(0, NO_CARTAO);
  const resto = eventos.length - visiveis.length;
  const partes = partesDoResumo(resumo);
  const rotulo = `${primeiraMaiuscula(tituloDoDia(dia))}${ehHoje ? " (hoje)" : ""}: ${textoDoResumo(resumo)}`;
  return (
    <motion.button
      type="button"
      onClick={onAbrir}
      aria-label={rotulo}
      title={eventos.length ? textoDoResumo(resumo) : undefined}
      whileTap={{ scale: 0.975 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
      className={cn(
        "group/dia relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[18px] border p-2.5 text-left",
        "transition-[background-color,border-color,opacity] duration-200 ease-out hover:border-border-default",
        nivel > 0 ? cn(TINTA[nivel], "border-border-subtle") : "border-border-subtle bg-panel hover:bg-raised",
        foraDoMes && "border-transparent bg-transparent opacity-45 hover:opacity-80",
        ehHoje && "ring-2 ring-accent-solid/70",
        focusRing
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "grid h-6 min-w-6 place-items-center rounded-full px-1 text-small tabular-nums",
            ehHoje ? "bg-accent-solid font-semibold text-text-on-accent" : nivel > 0 ? "font-medium text-text-primary" : "text-text-secondary"
          )}
        >
          {dia.dia}
        </span>
        {resumo.atrasadas > 0 && <span aria-hidden="true" className="size-1.5 rounded-full bg-danger-solid" />}
      </span>

      {visiveis.length > 0 && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {visiveis.map((e) => (
            <span key={e.id} className="relative flex min-w-0 items-center gap-1.5 pl-2">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0.5 left-0 w-[2px] rounded-full",
                  e.cor
                    ? CATEGORY_CLASSES[e.cor].solid
                    : e.origem === "negocio"
                      ? FAIXA_DO_FECHAMENTO
                      : e.feita
                        ? "bg-border-strong"
                        : e.atrasada
                          ? "bg-danger-solid"
                          : "bg-accent-solid"
                )}
              />
              {e.tipo && <IconeDoTipo tipo={e.tipo} className="size-3" />}
              {e.origem === "negocio" && <HandCoins aria-hidden="true" className="size-3 shrink-0 text-text-tertiary" />}
              {!e.diaTodo && <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{horaDoEvento(e)}</span>}
              <span className={cn("truncate text-caption", e.feita ? "text-text-tertiary line-through" : "text-text-primary")}>{e.titulo}</span>
            </span>
          ))}
        </span>
      )}

      {(resto > 0 || partes.length > 0) && (
        <span className="mt-auto flex min-w-0 items-center gap-1.5 font-mono text-caption tabular-nums">
          {resto > 0 && <span className="shrink-0 font-medium text-text-secondary">+{resto}</span>}
          <span className="ml-auto truncate text-right">
            {partes.map((p, i) => (
              <span key={p.texto} className={p.tom === "danger" ? "text-danger" : "text-text-tertiary"}>
                {i > 0 && " · "}
                {p.texto}
              </span>
            ))}
          </span>
        </span>
      )}
    </motion.button>
  );
}
