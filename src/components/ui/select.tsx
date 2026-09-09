import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-border-default bg-surface-2 px-3.5 pr-9 text-sm text-text-primary outline-none transition-colors",
          "focus:border-border-strong focus:ring-2 focus:ring-ice/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
    </div>
  );
}
