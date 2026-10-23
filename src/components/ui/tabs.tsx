"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/*
 * Abas de conteúdo (v5): trilho em cápsula, a aba ativa vira um polegar
 * invertido, como o SegmentedControl.
 * Para visões salvas de lista (com contagem e "+"), use ViewTabs.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-full border border-border-subtle bg-raised p-0.5", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-small font-medium text-text-secondary transition-colors duration-200 [&_svg]:size-3.5",
        "hover:text-text-primary data-[state=active]:bg-inverse data-[state=active]:text-inverse-fg",
        "disabled:pointer-events-none disabled:text-text-disabled",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
