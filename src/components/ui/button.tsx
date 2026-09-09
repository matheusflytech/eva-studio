import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
  {
    variants: {
      variant: {
        solid: "bg-ice text-bg-base hover:bg-white active:bg-ice/85",
        secondary:
          "bg-surface-2 text-text-primary border border-border-default hover:bg-surface-3 hover:border-border-strong",
        ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
        danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/20",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-lg",
        md: "h-10 px-4 text-sm rounded-xl",
        lg: "h-12 px-6 text-[15px] rounded-2xl",
        pill: "h-12 px-7 text-[15px] rounded-full",
        icon: "h-9 w-9 rounded-lg",
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
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
