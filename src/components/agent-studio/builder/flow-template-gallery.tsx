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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Modelos de fluxo"
        className="w-full max-w-lg rounded-[18px] border border-border-subtle bg-overlay p-5 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={16} aria-hidden="true" className="text-text-tertiary" />
            <p className="text-title-sm text-text-primary">Modelos de fluxo</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-small text-text-tertiary">
          Substitui o canvas atual por um ponto de partida pronto — você continua editando normalmente depois.
        </p>
        <div className="flex flex-col divide-y divide-border-subtle">
          {FLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="-mx-2 rounded-[12px] px-2 py-3 text-left transition-colors hover:bg-raised"
            >
              <p className="text-small font-medium text-text-primary">{t.name}</p>
              <p className="mt-0.5 text-caption text-text-tertiary">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
