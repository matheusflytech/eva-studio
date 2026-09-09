"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        isActive
          ? "bg-ice text-bg-base shadow-sm"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      )}
    >
      <Icon
        size={17}
        className={cn(
          "shrink-0",
          isActive ? "text-bg-base" : "text-text-tertiary group-hover:text-text-secondary",
          animated && isActive && "animate-aperture-breathe"
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-semibold text-text-tertiary">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
