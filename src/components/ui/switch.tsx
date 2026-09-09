"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full bg-surface-3 border border-border-default outline-none transition-colors",
        "data-[state=checked]:bg-accent-500 data-[state=checked]:border-accent-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
