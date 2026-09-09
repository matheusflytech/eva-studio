"use client";

import * as React from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </AuthProvider>
  );
}
