"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

/*
 * Toast: confirmação curta de algo que JÁ aconteceu ("Contato salvo").
 * Não use para erro de formulário (vai junto do campo) nem para pedir
 * decisão (use Modal). Some sozinho em 5s; pausa com o mouse em cima.
 * Erro usa role="alert" (anuncia na hora); o resto, role="status".
 */

export type ToastTone = "neutral" | "success" | "danger" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Ação única, ex.: { label: "Desfazer", onClick } */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = React.createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const push = React.useContext(ToastContext);
  if (!push) throw new Error("useToast precisa de <ToastProvider> acima (ver src/app/providers.tsx).");
  return push;
}

const icones = {
  neutral: null,
  success: <CheckCircle2 size={16} className="text-success" aria-hidden="true" />,
  danger: <AlertCircle size={16} className="text-danger" aria-hidden="true" />,
  info: <Info size={16} className="text-info" aria-hidden="true" />,
} satisfies Record<ToastTone, React.ReactNode>;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = React.useState<ToastItem[]>([]);
  const proximoId = React.useRef(1);

  const fechar = React.useCallback((id: number) => setItens((l) => l.filter((t) => t.id !== id)), []);
  const push = React.useCallback((t: ToastInput) => {
    const id = proximoId.current++;
    // No máximo 3 na tela: o mais antigo sai.
    setItens((l) => [...l.slice(-2), { ...t, id }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="region"
        aria-label="Notificações"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {itens.map((t) => (
          <ToastView key={t.id} toast={t} onClose={() => fechar(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const [pausado, setPausado] = React.useState(false);
  const tone = toast.tone ?? "neutral";
  // onClose muda a cada render do provider; o ref evita reiniciar o relógio.
  const fecharRef = React.useRef(onClose);
  React.useEffect(() => {
    fecharRef.current = onClose;
  });

  React.useEffect(() => {
    if (pausado) return;
    const t = window.setTimeout(() => fecharRef.current(), toast.durationMs ?? 5000);
    return () => window.clearTimeout(t);
  }, [pausado, toast.durationMs]);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border-default bg-overlay px-3 py-2.5 shadow-overlay",
        "animate-[ds-pop-in_200ms_var(--ease-standard)]"
      )}
    >
      {icones[tone] && <span className="mt-0.5">{icones[tone]}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-small text-text-secondary">{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          className="mt-px shrink-0 rounded-sm text-small font-medium text-accent-fg hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      <IconButton aria-label="Fechar notificação" size="sm" className="-mr-1 -mt-0.5 h-6 w-6" onClick={onClose}>
        <X />
      </IconButton>
    </div>
  );
}
