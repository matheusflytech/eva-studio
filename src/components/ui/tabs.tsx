"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-text-secondary transition-colors outline-none",
        "data-[state=active]:bg-surface-3 data-[state=active]:text-text-primary",
        className
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
