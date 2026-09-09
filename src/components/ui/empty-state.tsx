import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
}: {
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass-card flex flex-col items-center justify-center rounded-3xl px-10 py-20 text-center",
        className
      )}
    >
      {icon && <div className="mb-6">{icon}</div>}
      <h2 className="font-display text-2xl font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-3 max-w-sm text-[15px] text-text-secondary">{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
