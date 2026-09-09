import Link from "next/link";
import { Aperture, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agent-studio/${agent.id}`}>
      <Card className="group h-full transition-colors hover:border-border-strong hover:bg-surface-2">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
            <Aperture size={19} />
          </div>
          <Badge variant={agent.status === "active" ? "success" : "neutral"}>
            {agent.status === "active" ? "Ativo" : "Pausado"}
          </Badge>
        </div>

        <h3 className="mt-4 font-display text-[16px] font-semibold text-text-primary">
          {agent.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-[13px] text-text-secondary">
          {agent.description || "Sem descrição."}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4">
          <div className="flex items-center gap-3 text-[12px] text-text-tertiary">
            <span className="flex items-center gap-1">
              <FileText size={13} /> {agent.knowledgeBase.length}
            </span>
            <span>{agent.skills.length} habilidades</span>
          </div>
          <span className="text-[12px] text-text-tertiary">{formatRelativeDate(agent.updatedAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
