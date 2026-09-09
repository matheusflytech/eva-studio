import * as React from "react";
import { EmptyState } from "@/components/ui/empty-state";

export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <EmptyState
        className="max-w-lg"
        icon={icon}
        title={title}
        description={description}
        action={
          <span className="rounded-full border border-border-default bg-surface-2 px-4 py-2 text-[13px] font-medium text-text-tertiary">
            Em breve
          </span>
        }
      />
    </div>
  );
}
