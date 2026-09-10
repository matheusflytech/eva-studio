"use client";

import * as React from "react";
import { X, LayoutTemplate } from "lucide-react";
import { FLOW_TEMPLATES, type FlowTemplate } from "./flow-templates";

export function FlowTemplateGallery({
  onPick,
  onClose,
}: {
  onPick: (template: FlowTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="glass-card w-full max-w-lg rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={16} className="text-accent-400" />
            <p className="text-[15px] font-semibold text-text-primary">Modelos de fluxo</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-tertiary transition-colors hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] text-text-tertiary">
          Substitui o canvas atual por um ponto de partida pronto — você continua editando normalmente depois.
        </p>
        <div className="flex flex-col gap-2">
          {FLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-2xl border border-border-default bg-surface-2 p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-3"
            >
              <p className="text-[13.5px] font-medium text-text-primary">{t.name}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-tertiary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
