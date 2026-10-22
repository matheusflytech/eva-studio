import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/*
 * Botão. Um primário por área da tela; o resto é secondary ou ghost.
 * "solid" é o nome antigo de "primary" (continua valendo). Visual v5: todo
 * botão é cápsula; o secundário é preenchido, com borda de meio tom; ícone é
 * círculo. Tamanhos "lg" e "pill" ficam por compatibilidade.
 */
export const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium select-none",
    "transition-[background-color,color,transform] duration-150 ease-standard active:scale-[0.97] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
    focusRing
  ),
  {
    variants: {
      variant: {
        primary: "bg-accent-solid text-text-on-accent hover:bg-accent-solid-hover",
        solid: "bg-accent-solid text-text-on-accent hover:bg-accent-solid-hover",
        secondary: "border border-border-subtle bg-raised text-text-primary hover:bg-hover",
        ghost: "text-text-secondary hover:bg-hover hover:text-text-primary",
        danger: "bg-danger-solid text-text-on-danger hover:opacity-90",
      },
      size: {
        sm: "h-7 px-3 text-small",
        md: "h-8 px-3.5 text-small",
        lg: "h-9 px-4 text-body",
        pill: "h-9 px-4 text-body",
        icon: "h-8 w-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Mostra o indicador de progresso e bloqueia novo clique. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
