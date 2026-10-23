"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/* Tooltip: par inverso (escuro no tema claro, claro no escuro), texto curto,
   sem sombra. Nunca é o único lugar de uma informação essencial. */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-lg bg-inverse px-2 py-1 text-caption text-inverse-fg",
          "data-[state=delayed-open]:animate-[ds-fade-in_120ms_var(--ease-standard)]",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
