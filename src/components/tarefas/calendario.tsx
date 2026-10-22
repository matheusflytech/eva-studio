"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { focusRing } from "@/components/ui/styles";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import { pulsar } from "@/lib/fundo/eventos";
import { diaEmSP, mesmoDia, type Dia } from "@/lib/tarefas/calendario";
import type { VisaoDeTarefas } from "@/lib/tarefas/escopo";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import {
  NOMES_DOS_MESES,
  SEMANA_CURTA,
  agruparPorDia,
  chaveDoDia,
  compararMeses,
  densidade,
  diaDaChave,
  eventosDasTarefas,
  horaDoEvento,
  partesDoResumo,
  resumirDia,
  semanasDoMes,
  somarMeses,
  textoDoResumo,
  tituloDoDia,
  type EventoDoCalendario,
  type Mes,
} from "./calendario-dados";
import { buscarTarefas, FiltroDeQuem, type Resposta } from "./lista";
import { LinhaDeTarefa } from "./linha";
import { useConcluirTarefa } from "./concluir";
import { BlocoDeHorario, IconeDoTipo, SemTarefas, TituloDeGrupo, type Moldura } from "./pecas";

// Calendário (terceira aba de Tarefas): o mês em grade de cartões, domingo a
// sábado, no relógio de SP. Cada dia mostra até 3 eventos (ícone do tipo e
// hora), "+N" e o resumo (tarefas, reuniões, atrasadas); o cartão se tinge
// com a densidade do dia. Clicar abre o dia no painel lateral com as linhas
// de tarefa de sempre (concluir, adiar, ligar).
//
// Os dados chegam como EventoDoCalendario (calendario-dados.ts). Hoje a única
// fonte é a lista de tarefas; a agenda espelhada (Google/Outlook) entraria
// como mais uma fonte em `eventos` abaixo, sem mexer na grade nem no painel.

/** Eventos listados dentro do cartão do dia antes do "+N". */
const NO_CARTAO = 3;

// Mola curta: o mês desliza para o lado da navegação e esmaece.
const MOLA: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.8 };
const ESMAECER: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

const TINTA = ["", "bg-accent-subtle/40", "bg-accent-subtle/70", "bg-accent-subtle"] as const;

export function Calendario({ versao, onMudou, moldura }: { versao: number; onMudou: () => void; moldura: Moldura }) {
  const toast = useToast();
  const reduzir = useReducedMotion();
  const [visao, setVisao] = React.useState<VisaoDeTarefas>("minhas");
  const [visoes, setVisoes] = React.useState<VisaoDeTarefas[]>(["minhas"]);
  const [tarefas, setTarefas] = React.useState<TarefaDaTela[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [agora, setAgora] = React.useState(() => new Date());
  const [mes, setMes] = React.useState<Mes>(() => {
    const d = diaEmSP(new Date());
    return { ano: d.ano, mes: d.mes };
  });
  const [direcao, setDirecao] = React.useState(0);
  const [aberto, setAberto] = React.useState<string | null>(null);

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

  const carregar = React.useCallback(() => buscarTarefas(visao).then(aplicar), [visao, aplicar]);

  // A rota não filtra por data: a mesma busca da lista (abertas e feitas) e o
  // mês é recortado aqui.
  React.useEffect(() => {
    let vivo = true;
    buscarTarefas(visao).then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [visao, versao, aplicar]);

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
  const eventos = React.useMemo<EventoDoCalendario[]>(() => (tarefas ? eventosDasTarefas(tarefas, agora) : []), [tarefas, agora]);
  const porDia = React.useMemo(() => agruparPorDia(eventos), [eventos]);
  const semanas = React.useMemo(() => semanasDoMes(mes), [mes]);
  const hoje = diaEmSP(agora);

  function irPara(alvo: Mes) {
    setDirecao(compararMeses(mes, alvo) || 1);
    setMes(alvo);
  }
  const mesDeHoje: Mes = { ano: hoje.ano, mes: hoje.mes };
  const estaNoMesDeHoje = compararMeses(mes, mesDeHoje) === 0;

  // Atalhos: PageUp/PageDown trocam o mês (fora de campo e com o painel fechado).
  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (aberto || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const n = e.key === "PageDown" ? 1 : -1;
        setDirecao(n);
        setMes((m) => somarMeses(m, n));
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  // Contagem do mês (ao lado do título da tela).
  const doMes = React.useMemo(() => {
    const lista = eventos.filter((e) => {
      const d = diaEmSP(e.inicio);
      return d.ano === mes.ano && d.mes === mes.mes;
    });
    return resumirDia(lista);
  }, [eventos, mes]);

  const contagem =
    tarefas === null ? null : (
      <>
        {doMes.tarefas} {doMes.tarefas === 1 ? "aberta" : "abertas"} no mês
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
  const chaveDoMes = `${mes.ano}-${mes.mes}`;

  const diaAberto = aberto ? diaDaChave(aberto) : null;
  const eventosDoDia = aberto ? (porDia.get(aberto) ?? []) : [];
  const abertosDoDia = eventosDoDia.filter((e) => !e.feita);
  const feitosDoDia = eventosDoDia.filter((e) => e.feita);

  return moldura({
    contagem,
    lateral: (
      <FiltroDeQuem
        visoes={visoes}
        visao={visao}
        onEscolher={(v) => {
          setVisao(v);
        }}
      />
    ),
    conteudo: (
      <div className="flex flex-col gap-4">
        {/* Navegação: « ‹ Mês Ano › » e Hoje. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="min-w-[11ch] text-title font-light tracking-tight text-text-primary" aria-live="polite">
            {NOMES_DOS_MESES[mes.mes - 1]} <span className="text-text-tertiary">{mes.ano}</span>
          </h2>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Ano anterior" tooltip="Ano anterior" size="sm" onClick={() => irPara(somarMeses(mes, -12))}>
              <ChevronsLeft />
            </IconButton>
            <IconButton aria-label="Mês anterior" tooltip="Mês anterior (PageUp)" size="sm" onClick={() => irPara(somarMeses(mes, -1))}>
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Próximo mês" tooltip="Próximo mês (PageDown)" size="sm" onClick={() => irPara(somarMeses(mes, 1))}>
              <ChevronRight />
            </IconButton>
            <IconButton aria-label="Próximo ano" tooltip="Próximo ano" size="sm" onClick={() => irPara(somarMeses(mes, 12))}>
              <ChevronsRight />
            </IconButton>
          </div>
          <Button variant="secondary" size="sm" onClick={() => irPara(mesDeHoje)} disabled={estaNoMesDeHoje}>
            Hoje
          </Button>
        </div>

        {erro && <p role="alert" className="text-small text-danger">{erro}</p>}

        {/* Dias da semana em cápsulas (fixos; só o mês anima). */}
        <div className="grid grid-cols-7 gap-2" aria-hidden="true">
          {SEMANA_CURTA.map((d) => (
            <span key={d} className="grid h-8 place-items-center rounded-full border border-border-subtle bg-raised font-mono text-caption tracking-widest text-text-tertiary">
              {d}
            </span>
          ))}
        </div>

        {tarefas === null ? (
          <div className="grid grid-cols-7 gap-2" aria-busy="true">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-[18px]" />
            ))}
          </div>
        ) : (
          <div className="relative">
            <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
              <motion.div
                key={chaveDoMes}
                role="group"
                aria-label={`${NOMES_DOS_MESES[mes.mes - 1]} de ${mes.ano}`}
                custom={direcao}
                variants={variantes}
                initial="entra"
                animate="centro"
                exit="sai"
                transition={{ x: MOLA, opacity: ESMAECER, filter: ESMAECER }}
                className="grid w-full grid-cols-7 gap-2"
                style={{ gridAutoRows: "minmax(132px, 1fr)" }}
              >
                {semanas.flat().map((d) => {
                  const chave = chaveDoDia(d);
                  return (
                    <DiaDoCalendario
                      key={chave}
                      dia={d}
                      eventos={porDia.get(chave) ?? []}
                      foraDoMes={d.mes !== mes.mes}
                      ehHoje={mesmoDia(d, hoje)}
                      onAbrir={() => setAberto(chave)}
                    />
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

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

/** Tarefa vira a linha de tarefa de sempre; evento de agenda vira o bloco com faixa de cor e hora. */
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
                  e.cor ? CATEGORY_CLASSES[e.cor].solid : e.feita ? "bg-border-strong" : e.atrasada ? "bg-danger-solid" : "bg-accent-solid"
                )}
              />
              {e.tipo && <IconeDoTipo tipo={e.tipo} className="size-3" />}
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
