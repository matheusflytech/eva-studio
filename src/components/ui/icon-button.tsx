"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/*
 * Botão só de ícone. aria-label é obrigatório no tipo: ícone sozinho não diz
 * nada para leitor de tela. Opcionalmente mostra o mesmo texto num tooltip.
 */
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;
  variant?: "ghost" | "secondary" | "primary" | "danger";
  size?: "sm" | "md";
  /** Texto do tooltip. Passe true para repetir o aria-label. */
  tooltip?: string | boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "md", tooltip, type = "button", ...props }, ref) => {
    const botao = (
      <button
        ref={ref}
        type={type}
        className={cn(
          buttonVariants({ variant }),
          size === "sm" ? "h-7 w-7 [&_svg]:size-3.5" : "h-8 w-8 [&_svg]:size-4",
          "px-0",
          className
        )}
        {...props}
      />
    );
    if (!tooltip) return botao;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{botao}</TooltipTrigger>
        <TooltipContent>{tooltip === true ? props["aria-label"] : tooltip}</TooltipContent>
      </Tooltip>
    );
  }
);
IconButton.displayName = "IconButton";
