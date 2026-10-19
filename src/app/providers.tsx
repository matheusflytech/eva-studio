"use client";

import * as React from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { instalarFetchDoContrato } from "@/lib/contrato/fetch-do-app";

// Antes de qualquer componente buscar algo: toda chamada a /api/* passa a
// levar o contrato da URL da aba (cabeçalho x-eva-contrato).
instalarFetchDoContrato();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </AuthProvider>
  );
}
