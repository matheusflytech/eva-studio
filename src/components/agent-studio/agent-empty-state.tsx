"use client";

import Link from "@/components/contrato/link";
import { Plus } from "lucide-react";
import { MarcaEva } from "@/components/layout/marca-eva";
import { buttonVariants } from "@/components/ui/button";

// Nenhum agente ainda: uma frase e uma ação (v5, sem ilustração grande).
export function AgentEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-border-subtle bg-panel px-6 py-14 text-center">
      <MarcaEva size={22} className="text-text-secondary" />
      <p className="max-w-sm text-body text-text-secondary">
        Nenhum agente ainda. Crie o primeiro para atender no WhatsApp, no Instagram ou no seu site.
      </p>
      <Link href="/agent-studio/new" className={buttonVariants({ variant: "primary", size: "md", className: "mt-1" })}>
        <Plus size={15} aria-hidden="true" /> Novo agente
      </Link>
    </div>
  );
}
