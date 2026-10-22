"use client";

import * as React from "react";
import { AlarmClock, CalendarDays, Clock, Sunrise } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { paraCampoSaoPaulo } from "@/lib/fuso-sp";
import { ROTULO_DE_ADIAR, type OpcaoDeAdiar } from "@/lib/tarefas/adiar";
import { textoDoPrazo } from "@/lib/tarefas/formato";

// Adiar (snooze): +1h, amanhã 9h, próxima segunda 9h ou data escolhida. Na
// tarefa de negócio, "Empurrar também a previsão" move a previsão de
// fechamento pelos mesmos dias.

export interface TarefaParaAdiar {
  id: string;
  dueAt: string | null;
  deal: { id: string } | null;
}

export async function pedirAdiamento(
  id: string,
  corpo: { opcao: OpcaoDeAdiar; dueAt?: string; diaTodo?: boolean; empurrarPrevisao?: boolean }
): Promise<{ ok: true; dueAt: string; diaTodo: boolean; previsao: string | null; aviso?: string } | { ok: false; erro: string }> {
  try {
    const res = await fetch(`/api/tasks/${id}/adiar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: dados.error ?? "Não foi possível adiar." };
    return { ok: true, ...dados };
  } catch {
    return { ok: false, erro: "Sem conexão. A tarefa não foi adiada." };
  }
}

export function MenuDeAdiar({ tarefa, onAdiada }: { tarefa: TarefaParaAdiar; onAdiada: () => void }) {
  const toast = useToast();
  const [empurrar, setEmpurrar] = React.useState(false);
  const [escolher, setEscolher] = React.useState(false);

  async function adiar(opcao: OpcaoDeAdiar, extra: { dueAt?: string; diaTodo?: boolean; empurrar?: boolean } = {}) {
    const r = await pedirAdiamento(tarefa.id, { opcao, dueAt: extra.dueAt, diaTodo: extra.diaTodo, empurrarPrevisao: extra.empurrar ?? empurrar });
    if (!r.ok) {
      toast({ title: r.erro, tone: "danger" });
      return;
    }
    const partes = [`Para ${textoDoPrazo(r.dueAt, r.diaTodo, new Date()).toLowerCase()}`];
    if (r.previsao) partes.push(`previsão do negócio: ${new Date(r.previsao).toISOString().slice(0, 10).split("-").reverse().join("/")}`);
    toast({ title: "Tarefa adiada", description: [...partes, r.aviso].filter(Boolean).join(" · "), tone: "success" });
    onAdiada();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Adiar" tooltip size="sm">
            <AlarmClock />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => adiar("1h")}>
              <Clock /> {ROTULO_DE_ADIAR["1h"]}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adiar("amanha")}>
              <Sunrise /> {ROTULO_DE_ADIAR.amanha}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adiar("segunda")}>
              <CalendarDays /> {ROTULO_DE_ADIAR.segunda}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEscolher(true)}>
              <CalendarDays /> {ROTULO_DE_ADIAR.data}…
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {tarefa.deal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={empurrar}
                onCheckedChange={(v) => setEmpurrar(v === true)}
                // Marcar não fecha o menu: a pessoa ainda vai escolher a data.
                onSelect={(e) => e.preventDefault()}
              >
                Empurrar também a previsão
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {escolher && (
        <EscolherData
          tarefa={tarefa}
          empurrarInicial={empurrar}
          onFechar={() => setEscolher(false)}
          onEscolhida={async (dueAt, diaTodo, emp) => {
            setEscolher(false);
            await adiar("data", { dueAt, diaTodo, empurrar: emp });
          }}
        />
      )}
    </>
  );
}

function EscolherData({
  tarefa,
  empurrarInicial,
  onFechar,
  onEscolhida,
}: {
  tarefa: TarefaParaAdiar;
  empurrarInicial: boolean;
  onFechar: () => void;
  onEscolhida: (dueAt: string, diaTodo: boolean, empurrar: boolean) => void;
}) {
  const [diaTodo, setDiaTodo] = React.useState(false);
  const [valor, setValor] = React.useState(() => paraCampoSaoPaulo(new Date(Date.now() + 86_400_000)));
  const [empurrar, setEmpurrar] = React.useState(empurrarInicial);
  const idDiaTodo = React.useId();
  const idEmpurrar = React.useId();
  const campo = diaTodo ? valor.slice(0, 10) : valor;

  return (
    <Modal open onOpenChange={(a) => !a && onFechar()}>
      <ModalContent
        size="sm"
        title="Adiar para"
        footer={
          <>
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!campo} onClick={() => onEscolhida(campo, diaTodo, empurrar)}>
              Adiar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={diaTodo ? "Dia" : "Dia e hora (horário de Brasília)"}>
            <Input
              type={diaTodo ? "date" : "datetime-local"}
              value={campo}
              onChange={(e) => setValor(diaTodo ? `${e.target.value}T09:00` : e.target.value)}
            />
          </Field>
          <label htmlFor={idDiaTodo} className="flex items-center gap-2 text-small text-text-primary">
            <Checkbox id={idDiaTodo} checked={diaTodo} onCheckedChange={(v) => setDiaTodo(v === true)} /> Dia todo
          </label>
          {tarefa.deal && (
            <label htmlFor={idEmpurrar} className="flex items-center gap-2 text-small text-text-primary">
              <Checkbox id={idEmpurrar} checked={empurrar} onCheckedChange={(v) => setEmpurrar(v === true)} /> Empurrar também a previsão de fechamento
            </label>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
