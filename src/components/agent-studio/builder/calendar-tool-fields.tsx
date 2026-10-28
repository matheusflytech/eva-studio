"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ExternalLink } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FlowNodeData } from "./flow-node";

interface ConexaoRow {
  id: string;
  email: string;
  name: string;
  calendars: { id: string; name: string }[];
}

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_DOS_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DURACOES = [15, 30, 45, 60, 90];

/**
 * Bloco "Agenda Google": em que agenda (de quem) a IA marca, quanto dura a
 * reunião e quando a pessoa atende. A IA só oferece e marca horários livres
 * dentro disso; a agenda vem das pessoas que conectaram a conta em
 * Configurações → Sua conta.
 */
export function CalendarToolFields({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const [conexoes, setConexoes] = React.useState<ConexaoRow[] | null>(null);
  React.useEffect(() => {
    fetch("/api/integrations/google-calendar?all=1")
      .then((r) => r.json())
      .then((d) => setConexoes(d.connections ?? []))
      .catch(() => setConexoes([]));
  }, []);

  const conexao = conexoes?.find((c) => c.id === data.calendarConnectionId);
  const dias = data.calendarDays ?? [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="node-cal-conn">Agenda de quem</Label>
        <Select
          id="node-cal-conn"
          value={data.calendarConnectionId ?? ""}
          onChange={(e) => {
            const c = conexoes?.find((x) => x.id === e.target.value);
            onChange({ calendarConnectionId: e.target.value, calendarId: c?.calendars[0]?.id ?? "" });
          }}
        >
          <option value="">Selecione…</option>
          {(conexoes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </Select>
        {conexoes && conexoes.length === 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-caption text-text-tertiary">
            Ninguém conectou o Google ainda. Conecte em{" "}
            <Link href="/settings?tab=account" className="inline-flex items-center gap-1 text-accent-fg hover:underline">
              Sua conta <ExternalLink size={11} />
            </Link>
          </p>
        )}
        {conexoes && data.calendarConnectionId && !conexao && (
          <p className="mt-1.5 text-caption text-danger">Essa agenda foi desconectada. Escolha outra.</p>
        )}
      </div>

      {conexao && (
        <div>
          <Label htmlFor="node-cal-id">Agenda</Label>
          <Select id="node-cal-id" value={data.calendarId ?? ""} onChange={(e) => onChange({ calendarId: e.target.value })}>
            {conexao.calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="node-cal-dur">Duração da reunião</Label>
        <Select id="node-cal-dur" value={String(data.calendarDurationMin ?? 30)} onChange={(e) => onChange({ calendarDurationMin: Number(e.target.value) })}>
          {DURACOES.map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : m === 60 ? "1 h" : `${m / 60} h`.replace(".", ",")}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Dias de atendimento</Label>
        <div className="flex gap-1.5" role="group" aria-label="Dias de atendimento">
          {DIAS.map((d, i) => {
            const ligado = dias.includes(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={ligado}
                aria-label={NOMES_DOS_DIAS[i]}
                onClick={() => onChange({ calendarDays: ligado ? dias.filter((x) => x !== i) : [...dias, i].sort() })}
                className={cn(
                  "size-8 rounded-full text-caption font-semibold transition-colors",
                  ligado ? "bg-accent-solid text-white" : "bg-raised text-text-tertiary hover:text-text-primary"
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="node-cal-start">Das</Label>
          <Input id="node-cal-start" type="time" value={data.calendarStart ?? "09:00"} onChange={(e) => onChange({ calendarStart: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="node-cal-end">Até</Label>
          <Input id="node-cal-end" type="time" value={data.calendarEnd ?? "18:00"} onChange={(e) => onChange({ calendarEnd: e.target.value })} />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-small text-text-primary">
        <Checkbox checked={data.calendarMeet !== false} onCheckedChange={(v) => onChange({ calendarMeet: v === true })} />
        Criar link do Google Meet
      </label>

      <p className="text-caption text-text-tertiary">
        Conecte este bloco na porta roxa embaixo de um Agente de IA. A IA consulta os horários livres (horário de Brasília) e
        marca a reunião com o e-mail do cliente como convidado. Ela nunca marca fora desses dias e horas nem em cima de outro
        compromisso.
      </p>
    </div>
  );
}
