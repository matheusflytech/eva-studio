"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/* Liga/desliga com efeito imediato. Para opção que só vale ao salvar, use Checkbox. */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors duration-160",
        "data-[state=checked]:bg-accent-solid disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-text-on-accent transition-transform duration-160 ease-standard data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}
