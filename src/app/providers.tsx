"use client";

import * as React from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeSync } from "@/components/ui/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <ToastProvider>
          <ThemeSync />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}
