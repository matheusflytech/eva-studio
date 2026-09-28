"use client";

import * as React from "react";
import { CheckSquare, Plus, Loader2, Phone, Mail, Users, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { cn, formatRelativeDate } from "@/lib/utils";

interface Task {
  id: string;
  type: string;
  text: string;
  dueAt: string | null;
  doneAt: string | null;
  overdue: boolean;
  contact: { id: string; name: string; phone: string } | null;
  deal: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  ligar: <Phone size={13} />,
  email: <Mail size={13} />,
  reuniao: <Users size={13} />,
  outro: <Circle size={13} />,
};

const TYPE_LABEL: Record<string, string> = {
  ligar: "Ligar",
  email: "E-mail",
  reuniao: "Reunião",
  outro: "Outro",
};

export default function TarefasPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [scope, setScope] = React.useState("minhas");
  const [status, setStatus] = React.useState("abertas");
  const [isLoading, setIsLoading] = React.useState(true);
  const [showNew, setShowNew] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/tasks?scope=${scope}&status=${status}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setIsLoading(false);
  }, [scope, status]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function toggle(task: Task) {
    // Marca na tela antes da resposta: check que demora a pintar faz a lista
    // parecer travada.
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, doneAt: t.doneAt ? null : new Date().toISOString() } : t))
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.doneAt }),
    });
    refresh();
  }

  const overdueCount = tasks.filter((t) => t.overdue).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Tarefas</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            {overdueCount > 0 ? (
              <>
                <span className="font-semibold text-danger">{overdueCount} atrasada(s)</span> de {tasks.length}
              </>
            ) : (
              "O que precisa de você, e quando."
            )}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-[150px]">
            <Label htmlFor="scope">Ver</Label>
            <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="minhas">Minhas</option>
              <option value="todas">Do time</option>
            </Select>
          </div>
          <div className="w-[150px]">
            <Label htmlFor="status">Estado</Label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="abertas">Abertas</option>
              <option value="feitas">Feitas</option>
              <option value="todas">Todas</option>
            </Select>
          </div>
          <Button onClick={() => setShowNew(true)}>
            <Plus size={15} /> Nova tarefa
          </Button>
        </div>
      </header>

      {isLoading && tasks.length === 0 ? (
        <p className="text-[14px] text-text-tertiary">Carregando...</p>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={36} className="text-text-tertiary" />}
          title="Nada por aqui"
          description="Tarefas aparecem quando você cria uma, ou quando um fluxo do Builder cria automaticamente depois de uma conversa."
        />
      ) : (
        <Card className="flex flex-col gap-1 p-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2/60"
            >
              <button onClick={() => toggle(task)} className="mt-0.5" aria-label="Concluir tarefa">
                <Checkbox checked={!!task.doneAt} />
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[14px] text-text-primary",
                    task.doneAt && "text-text-tertiary line-through"
                  )}
                >
                  {task.text}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11.5px] text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    {TYPE_ICON[task.type] ?? TYPE_ICON.outro} {TYPE_LABEL[task.type] ?? task.type}
                  </span>
                  {task.contact && <span>{task.contact.name || task.contact.phone}</span>}
                  {task.deal && <span>· {task.deal.name}</span>}
                  {task.assignedTo && <span>· {task.assignedTo.name}</span>}
                </div>
              </div>
              {task.dueAt && (
                <Badge variant={task.overdue ? "danger" : "neutral"}>
                  {formatRelativeDate(task.dueAt)}
                </Badge>
              )}
            </div>
          ))}
        </Card>
      )}

      {showNew && (
        <NewTaskModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />
      )}
    </div>
  );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({ text: "", type: "ligar", dueAt: "" });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Nova tarefa">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="task-text">O que fazer</Label>
            <Input id="task-text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-type">Tipo</Label>
              <Select id="task-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="ligar">Ligar</option>
                <option value="email">E-mail</option>
                <option value="reuniao">Reunião</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-due">Prazo</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !form.text.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
