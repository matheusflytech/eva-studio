"use client";

import Link from "@/components/contrato/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NovoAgenteEtapas } from "@/components/agent-studio/novo-agente-etapas";

export default function NewAgentPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      <div className="mx-auto flex min-h-10 w-full max-w-2xl items-center gap-2">
        <Link
          href="/agent-studio"
          aria-label="Voltar para Eva Studio"
          className={buttonVariants({ variant: "ghost", size: "icon", className: "-ml-1.5 shrink-0" })}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Novo agente</h1>
      </div>
      <NovoAgenteEtapas />
    </div>
  );
}
