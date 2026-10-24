"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { usePathname } from "@/lib/contrato/navegacao";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MOLA } from "@/lib/design-system/movimento";

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  badge,
  collapsed,
  animated,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  collapsed?: boolean;
  animated?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-[34px] items-center gap-2.5 rounded-[10px] px-2.5 text-small font-medium transition-colors",
        // Item ativo em cinza preenchido (a pílula desliza entre os itens); a
        // cor fica para o dado (contador).
        isActive ? "text-text-primary" : "text-text-secondary hover:bg-raised hover:text-text-primary"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="menu-item-ativo"
          className="absolute inset-0 -z-10 rounded-[10px] bg-hover"
          transition={MOLA}
        />
      )}
      <Icon
        size={17}
        className={cn(
          "shrink-0",
          isActive ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary",
          animated && isActive && "animate-aperture-breathe"
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span className="rounded-full bg-accent-solid px-1.5 font-mono text-caption font-medium leading-[18px] text-text-on-accent">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
