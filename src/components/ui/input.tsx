import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./styles";

/*
 * Campos de texto. Rótulo sempre visível (Label ou Field), nunca só
 * placeholder. Erro aparece logo abaixo do campo, em texto, ligado por
 * aria-describedby (Field faz isso sozinho).
 */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn(fieldBase, "h-8 px-2.5", className)} {...props} />;
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-20 resize-y px-2.5 py-1.5", className)} {...props} />;
});
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-small font-medium text-text-primary", className)} {...props} />;
}

export interface FieldProps {
  label: React.ReactNode;
  /** Texto de ajuda abaixo do campo. Some quando há erro. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** O campo. Recebe id, aria-invalid e aria-describedby automaticamente. */
  children: React.ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }>;
}

/** Rótulo + campo + ajuda/erro, com os ids ligados para leitor de tela. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const autoId = React.useId();
  const id = children.props.id ?? autoId;
  const descId = `${id}-desc`;
  const temDesc = Boolean(error || hint);
  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {React.cloneElement(children, {
        id,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": temDesc ? descId : undefined,
      })}
      {temDesc && (
        <p id={descId} className={cn("mt-1 text-caption", error ? "text-danger" : "text-text-tertiary")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
