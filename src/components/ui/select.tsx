import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./styles";

/* Select nativo (melhor no celular e no teclado). Para múltipla escolha com
   busca, use FilterButton. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select ref={ref} className={cn(fieldBase, "h-8 appearance-none pl-2.5 pr-8", className)} {...props}>
          {children}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
      </div>
    );
  }
);
Select.displayName = "Select";
