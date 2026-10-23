"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/styles";
import { pulsar } from "@/lib/fundo/eventos";
import { QuickAdd, useAtalhoT } from "@/components/tarefas/quick-add";
import { MeuDia } from "@/components/tarefas/meu-dia";
import { ListaDeTarefas } from "@/components/tarefas/lista";
import { Calendario } from "@/components/tarefas/calendario";
import { useSearchParams } from "@/lib/contrato/navegacao";
import type { Moldura } from "@/components/tarefas/pecas";

type Aba = "dia" | "lista" | "calendario";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "dia", rotulo: "Meu dia" },
  { valor: "lista", rotulo: "Todas as tarefas" },
  { valor: "calendario", rotulo: "Calendário" },
];

const ehAba = (v: string | null): v is Aba => ABAS.some((a) => a.valor === v);

/** A aba mora na URL (?aba=lista|calendario; Meu dia é o padrão, sem parâmetro), sem recarregar. */
function gravarAba(aba: Aba) {
  const sp = new URLSearchParams(window.location.search);
  if (aba === "dia") sp.delete("aba");
  else sp.set("aba", aba);
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

// Tarefas: "Meu dia" (a home do vendedor: o que fazer agora, os compromissos
// e a fila curta), a lista completa por data e o Calendário do mês. "Nova tarefa" (ou T) abre o
// campo em linguagem natural embaixo da barra. Cada aba preenche a moldura
// (contagem, ações e o lado direito da sub-barra) com o que é dela.
// useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
export default function TarefasPage() {
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <Tarefas />
    </React.Suspense>
  );
}

function Tarefas() {
  const pedida = useSearchParams().get("aba");
  const [aba, setAbaLocal] = React.useState<Aba>(() => (ehAba(pedida) ? pedida : "dia"));
  const setAba = React.useCallback((a: Aba) => {
    setAbaLocal(a);
    gravarAba(a);
  }, []);
  // Muda quando algo é criado/concluído/adiado: as duas abas recarregam.
  const [versao, setVersao] = React.useState(0);
  const [criando, setCriando] = React.useState(false);
  const campo = React.useRef<HTMLInputElement>(null);
  const mudou = React.useCallback(() => setVersao((v) => v + 1), []);

  const abrirCriacao = React.useCallback(() => {
    if (campo.current) campo.current.focus();
    else setCriando(true);
  }, []);
  useAtalhoT(abrirCriacao);

  // O campo acabou de aparecer: foco nele.
  React.useEffect(() => {
    if (criando) campo.current?.focus();
  }, [criando]);

  const moldura: Moldura = ({ contagem, acoes, lateral, conteudo, coluna }) => (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título e contagem; à direita, Nova tarefa, "…" e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Tarefas</h1>
        {contagem && <span className="font-mono text-caption tabular-nums text-text-tertiary">{contagem}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={abrirCriacao} title="Nova tarefa (T)" aria-keyshortcuts="T">
            <Plus size={14} aria-hidden="true" />
            Nova tarefa
            <kbd className="hidden rounded-md border border-border-subtle px-1.5 font-mono text-caption text-text-tertiary sm:inline">T</kbd>
          </Button>
          {acoes}
        </div>
      </div>

      {criando && (
        <QuickAdd
          ref={campo}
          className="w-full"
          onCriada={() => {
            pulsar(campo.current, 1.2);
            mudou();
          }}
          onFechar={() => setCriando(false)}
        />
      )}

      {/* Sub-barra: abas em cápsula e, à direita, o que a aba aberta oferece. */}
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
        <div role="tablist" aria-label="Visões de tarefas" className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-raised p-0.5">
          {ABAS.map((a) => {
            const ativa = a.valor === aba;
            return (
              <button
                key={a.valor}
                type="button"
                role="tab"
                id={`aba-${a.valor}`}
                aria-selected={ativa}
                aria-controls="painel-de-tarefas"
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
                  "inline-flex h-full items-center rounded-full px-3 text-small transition-colors duration-150",
                  ativa ? "bg-inverse font-semibold text-inverse-fg" : "font-medium text-text-secondary hover:text-text-primary",
                  focusRing
                )}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
        {lateral && <div className="ml-auto flex items-center gap-2">{lateral}</div>}
      </div>

      {/* Largura toda. Com coluna (Meu dia, Todas as tarefas), no desktop largo
          vira lista + coluna fixa de 340px; abaixo de 1280px, uma coluna só. */}
      <div
        id="painel-de-tarefas"
        role="tabpanel"
        aria-labelledby={`aba-${aba}`}
        className={cn("w-full min-w-0", coluna && "xl:grid xl:grid-cols-[minmax(560px,1fr)_340px] xl:items-start xl:gap-8")}
      >
        <div className="min-w-0">{conteudo}</div>
        {coluna && <aside aria-label="Resumo do dia" className="hidden xl:sticky xl:top-2 xl:block">{coluna}</aside>}
      </div>
    </div>
  );

  if (aba === "calendario") return <Calendario versao={versao} onMudou={mudou} moldura={moldura} />;
  return aba === "dia" ? (
    <MeuDia versao={versao} onMudou={mudou} moldura={moldura} />
  ) : (
    <ListaDeTarefas versao={versao} onMudou={mudou} moldura={moldura} />
  );
}
