"use client";

import * as React from "react";
import { MotionConfig } from "framer-motion";
import { MOLA } from "@/lib/design-system/movimento";
import { AuthProvider } from "@/lib/auth/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeSync } from "@/components/ui/theme";
import { instalarFetchDoContrato } from "@/lib/contrato/fetch-do-app";

// Antes de qualquer componente buscar algo: toda chamada a /api/* passa a
// levar o contrato da URL da aba (cabeçalho x-eva-contrato).
instalarFetchDoContrato();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // framer-motion: "reduzir movimento" do sistema vale em todo lugar, e a mola
    // do app é o padrão de quem não escolhe outra (ver movimento.ts).
    <MotionConfig reducedMotion="user" transition={MOLA}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <ToastProvider>
            <ThemeSync />
            {children}
          </ToastProvider>
        </TooltipProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
