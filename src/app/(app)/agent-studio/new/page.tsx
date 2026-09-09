"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentForm } from "@/components/agent-studio/agent-form";

export default function NewAgentPage() {
  return (
    <div className="flex-1 p-8">
      <Link
        href="/agent-studio"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> Eva Studio
      </Link>
      <h1 className="mx-auto mb-6 max-w-2xl font-display text-xl font-semibold text-text-primary">
        Novo agente
      </h1>
      <AgentForm />
    </div>
  );
}
