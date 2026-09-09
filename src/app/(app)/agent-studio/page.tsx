"use client";

import * as React from "react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { AgentEmptyState } from "@/components/agent-studio/agent-empty-state";
import { AgentGrid } from "@/components/agent-studio/agent-grid";

export default function AgentStudioPage() {
  const { agents, isLoaded, load } = useAgentsStore();

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isLoaded) {
    return <div className="flex-1 p-8" />;
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <AgentEmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <AgentGrid agents={agents} />
    </div>
  );
}
