"use client";

import * as React from "react";
import { Braces } from "lucide-react";

// Botão pequeno que abre uma lista das variáveis já capturadas em outros
// blocos do fluxo (Captura de input, Variável, Chamar webhook) e insere
// {nome} no cursor do campo de texto — em vez de precisar decorar/digitar o
// nome certo na mão.
export function VariablePicker({
  variables,
  targetRef,
  value,
  onChange,
}: {
  variables: string[];
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function insert(name: string) {
    const el = targetRef.current;
    const insertText = `{${name}}`;
    if (!el) {
      onChange(value + insertText);
      setOpen(false);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + insertText + value.slice(end);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertText.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-400 transition-colors hover:bg-accent-soft"
        title="Inserir variável"
      >
        <Braces size={11} /> Variável
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-48 w-52 overflow-y-auto rounded-xl border border-border-subtle bg-surface-2 p-1.5 shadow-xl">
          {variables.length === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] leading-relaxed text-text-tertiary">
              Nenhuma variável ainda. Crie uma num bloco de Captura de input, Variável ou Chamar webhook.
            </p>
          ) : (
            variables.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => insert(name)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-[11.5px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
              >
                {"{" + name + "}"}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
