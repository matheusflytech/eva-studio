"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface-2 outline-none transition-colors",
        "data-[state=checked]:bg-accent-500 data-[state=checked]:border-accent-500",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check size={13} className="text-white" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
