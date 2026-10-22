"use client";

import * as React from "react";
import { Flag, Plus, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { interpretarQuickAdd } from "@/lib/tarefas/quick-add";
import { textoDoPrazo } from "@/lib/tarefas/formato";
import { INFO_DO_TIPO } from "@/lib/tarefas/tipos";
import { IconeDoTipo } from "./pecas";

// Quick add em linguagem natural: "ligar João amanhã 14h". A prévia embaixo
// mostra o que foi entendido antes de criar (o servidor usa o mesmo parser).
// Atalho: T em qualquer lugar da tela (fora de campo de texto) foca aqui.

/** T (sem modificador, fora de campo de texto) chama `acao`. */
export function useAtalhoT(acao: () => void) {
  const ref = React.useRef(acao);
  React.useEffect(() => {
    ref.current = acao;
  });
  React.useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "t" && e.key !== "T") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      // Diálogo aberto: o T é dele.
      if (document.querySelector("[role='dialog']")) return;
      e.preventDefault();
      ref.current();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}

export const QuickAdd = React.forwardRef<
  HTMLInputElement,
  {
    onCriada: () => void;
    contactId?: string | null;
    dealId?: string | null;
    className?: string;
    placeholder?: string;
  }
>(function QuickAdd({ onCriada, contactId, dealId, className, placeholder }, ref) {
  const toast = useToast();
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const idDaPrevia = React.useId();

  const previa = React.useMemo(() => (texto.trim() ? interpretarQuickAdd(texto, new Date()) : null), [texto]);

  async function criar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/tasks/rapida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t, contactId: contactId ?? undefined, dealId: dealId ?? undefined }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: dados.error ?? "Não foi possível criar a tarefa.", tone: "danger" });
        return;
      }
      const vinculo = dados.negocio?.nome ?? dados.contato?.nome;
      toast({
        title: "Tarefa criada",
        description: dados.ambiguo
          ? `Mais de um contato chamado “${dados.interpretado?.pessoa}”: ficou sem vínculo.`
          : vinculo
            ? `Ligada a ${vinculo}.`
            : undefined,
        tone: "success",
      });
      setTexto("");
      onCriada();
    } catch {
      toast({ title: "Sem conexão. A tarefa não foi criada.", tone: "danger" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <Input
          ref={ref}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              criar();
            }
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder={placeholder ?? "Nova tarefa: “ligar João amanhã 14h” (atalho T)"}
          aria-label="Nova tarefa em linguagem natural"
          aria-describedby={previa ? idDaPrevia : undefined}
        />
        <Button variant="secondary" onClick={criar} disabled={!texto.trim()} loading={enviando}>
          <Plus size={14} aria-hidden /> Criar
        </Button>
      </div>
      {previa && (
        <p id={idDaPrevia} aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-caption text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <IconeDoTipo tipo={previa.tipo} className="size-3.5" /> {INFO_DO_TIPO[previa.tipo].rotulo}
          </span>
          <span>{previa.dueAt ? textoDoPrazo(previa.dueAt, previa.diaTodo, new Date()) : "Sem data"}</span>
          {previa.pessoa && (
            <span className="inline-flex items-center gap-1">
              <User size={12} aria-hidden /> {previa.pessoa}
            </span>
          )}
          {previa.prioridade === "alta" && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Flag size={12} aria-hidden /> Alta
            </span>
          )}
          {previa.titulo && <span className="truncate text-text-tertiary">“{previa.titulo}”</span>}
        </p>
      )}
    </div>
  );
});
