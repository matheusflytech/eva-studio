import {
  MessageCircle,
  ListChecks,
  Aperture,
  GitBranch,
  Braces,
  Webhook,
  UserCheck,
  Clock,
  Square,
} from "lucide-react";
import type { IconKey } from "./icon-registry";

const BLOCKS: { key: IconKey; icon: typeof MessageCircle; label: string }[] = [
  { key: "message", icon: MessageCircle, label: "Mensagem" },
  { key: "capture", icon: ListChecks, label: "Captura de input" },
  { key: "agent", icon: Aperture, label: "Agente de IA" },
  { key: "condition", icon: GitBranch, label: "Condição" },
  { key: "variable", icon: Braces, label: "Variável" },
  { key: "webhook", icon: Webhook, label: "Chamar webhook" },
  { key: "human", icon: UserCheck, label: "Transferir p/ humano" },
  { key: "wait", icon: Clock, label: "Esperar" },
  { key: "end", icon: Square, label: "Encerrar" },
];

export function BlockPalette({ onAdd }: { onAdd: (iconKey: IconKey, label: string) => void }) {
  return (
    <div className="glass-card w-[220px] shrink-0 rounded-3xl p-4">
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Blocos</p>
      <p className="mb-3 px-1 text-[11.5px] text-text-tertiary">Clique para adicionar ao canvas.</p>
      <div className="flex flex-col gap-1">
        {BLOCKS.map(({ icon: Icon, label, key }) => (
          <button
            key={label}
            type="button"
            onClick={() => onAdd(key, label)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-tertiary">
              <Icon size={14} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
