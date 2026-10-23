"use client";

import type { LucideIcon } from "lucide-react";
import { LogoOficial, ladoDoLogo, type Marca } from "@/components/ui/logo-oficial";
import { cn } from "@/lib/utils";
import { BLOCK_STYLES } from "./block-styles";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";

// Bloco que é um serviço de fora mostra o logo oficial no lugar do ícone
// genérico (hoje só o "Enviar para o n8n"). O logo já tem a cor dele: o selo
// fica neutro, sem a cor de categoria do bloco.
export const MARCA_DO_BLOCO: Partial<Record<IconKey, Marca>> = {
  agent: "n8n",
};

export function marcaDoBloco(iconKey: string | null | undefined): Marca | undefined {
  return iconKey ? MARCA_DO_BLOCO[iconKey as IconKey] : undefined;
}

/** Classes do selo do ícone: neutro para bloco com marca, senão as cores da categoria. */
export function seloDoBloco(iconKey: string | null | undefined): string {
  if (marcaDoBloco(iconKey)) return "border border-border-subtle bg-panel";
  const estilo = BLOCK_STYLES[iconKey as IconKey];
  return cn(estilo?.badgeBg, estilo?.badgeText);
}

export function IconeDoBloco({
  iconKey,
  size,
  strokeWidth,
  className,
  reserva,
}: {
  iconKey: string | null | undefined;
  size: number;
  strokeWidth?: number;
  className?: string;
  /** Ícone quando a chave não está no registro. */
  reserva?: LucideIcon;
}) {
  const marca = marcaDoBloco(iconKey);
  if (marca) return <LogoOficial marca={marca} tamanho={ladoDoLogo(marca, size)} />;
  const Icone = ICON_REGISTRY[iconKey as IconKey] ?? reserva;
  if (!Icone) return null;
  return <Icone size={size} strokeWidth={strokeWidth} aria-hidden="true" className={className} />;
}
