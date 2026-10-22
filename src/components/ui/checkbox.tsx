"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/* Checkbox 16px. checked="indeterminate" mostra o traço (seleção parcial). */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border-strong bg-panel transition-colors duration-120",
        "hover:border-text-tertiary",
        "data-[state=checked]:border-accent-solid data-[state=checked]:bg-accent-solid",
        "data-[state=indeterminate]:border-accent-solid data-[state=indeterminate]:bg-accent-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-text-on-accent">
        <Check size={12} strokeWidth={3} className="group-data-[state=indeterminate]:hidden" aria-hidden="true" />
        <Minus size={12} strokeWidth={3} className="hidden group-data-[state=indeterminate]:block" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
