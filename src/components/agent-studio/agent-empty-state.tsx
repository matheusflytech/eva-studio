"use client";

import Link from "next/link";
import { Starburst } from "./starburst";
import { buttonVariants } from "@/components/ui/button";

export function AgentEmptyState() {
  return (
    <div className="glass-card relative flex flex-1 items-center justify-center overflow-hidden rounded-3xl">
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(245,247,250,0.12), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center px-6 text-center">
        <Starburst className="h-[220px] w-[220px]" />
        <h1 className="mt-2 font-display text-[26px] font-semibold text-text-primary">
          Bem-vindo ao Eva Studio
        </h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          Crie seu primeiro agente em menos de 90 minutos.
        </p>
        <Link
          href="/agent-studio/new"
          className={buttonVariants({ size: "pill", variant: "secondary", className: "mt-8" })}
        >
          Novo Agente
        </Link>
      </div>
    </div>
  );
}
