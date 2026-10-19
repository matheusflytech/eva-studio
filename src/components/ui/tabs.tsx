"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/*
 * Abas de conteúdo: sublinhado na aba ativa, sem caixa nem pílula.
 * Para visões salvas de lista (com contagem e "+"), use ViewTabs.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-4 border-b border-border-subtle", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent text-body font-medium text-text-secondary transition-colors duration-120",
        "hover:text-text-primary data-[state=active]:border-text-primary data-[state=active]:text-text-primary",
        "disabled:pointer-events-none disabled:text-text-disabled",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
