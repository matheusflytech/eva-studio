import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-xl border border-border-default bg-surface-2 px-3.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors",
          "focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20",
          "disabled:opacity-40 disabled:pointer-events-none",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-border-default bg-surface-2 px-3.5 py-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors resize-none",
        "focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-[13px] font-medium text-text-secondary", className)}
      {...props}
    />
  );
}
