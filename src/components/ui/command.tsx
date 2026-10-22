"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Command (lista com busca e teclado), sobre o `cmdk` — a mesma base do
 * Command do shadcn. Não veio pelo CLI: o `shadcn add command` deste projeto
 * gerava `import { cn } from "cn"` e puxava o pacote `radix-ui` inteiro. Aqui
 * é o desenho do shadcn com os tokens da casa: linha de 36px, item
 * selecionado em accent-subtle, título de grupo em caption. A paleta global
 * (src/components/busca/paleta-de-busca.tsx) é quem usa.
 */

export const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn("flex h-full w-full flex-col overflow-hidden bg-overlay text-text-primary", className)}
      {...props}
    />
  );
});

/** Campo de 48px com lupa (texto 16px: no celular abaixo disso o navegador dá zoom). */
export const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { antes?: React.ReactNode; depois?: React.ReactNode }
>(function CommandInput({ className, antes, depois, ...props }, ref) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
      {antes ?? <Search size={16} className="shrink-0 text-text-tertiary" aria-hidden />}
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-body-lg text-text-primary outline-none placeholder:text-text-tertiary",
          className
        )}
        {...props}
      />
      {depois}
    </div>
  );
});

export const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn("max-h-[min(60dvh,440px)] overflow-y-auto overscroll-contain p-1.5", className)}
      {...props}
    />
  );
});

export const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return <CommandPrimitive.Empty ref={ref} className={cn("px-3 py-6 text-center text-small text-text-secondary", className)} {...props} />;
});

export const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        "py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5",
        "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-tertiary",
        className
      )}
      {...props}
    />
  );
});

export const CommandSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(function CommandSeparator({ className, ...props }, ref) {
  return <CommandPrimitive.Separator ref={ref} className={cn("-mx-1.5 my-1 h-px bg-border-subtle", className)} {...props} />;
});

export const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-small text-text-primary outline-none",
        "transition-colors duration-[120ms] data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-fg",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:text-text-disabled",
        "[&_svg]:shrink-0 [&_svg]:text-text-tertiary data-[selected=true]:[&_svg]:text-accent-fg",
        className
      )}
      {...props}
    />
  );
});

/** Tecla de atalho (⌘K, G depois N). */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-default bg-raised px-1 font-sans text-caption text-text-secondary",
        className
      )}
      {...props}
    />
  );
}
