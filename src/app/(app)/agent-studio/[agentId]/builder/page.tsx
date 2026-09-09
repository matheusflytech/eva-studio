"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, PlayCircle } from "lucide-react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Connection, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlowNode, type FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { BlockPalette } from "@/components/agent-studio/builder/block-palette";
import { NodeInspector } from "@/components/agent-studio/builder/node-inspector";
import { SAMPLE_NODES, SAMPLE_EDGES } from "@/components/agent-studio/builder/flow-data";
import { getFlow, saveFlow } from "@/lib/data/flows";
import { generateId } from "@/lib/utils";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";

const NODE_TYPES = { flowNode: FlowNode };

export default function AgentBuilderPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { agents, isLoaded, load } = useAgentsStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(SAMPLE_EDGES);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [flowLoaded, setFlowLoaded] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (flowLoaded || !agentId) return;
    getFlow(agentId).then((saved) => {
      if (saved) {
        setNodes(saved.nodes);
        setEdges(saved.edges);
      } else {
        setNodes(SAMPLE_NODES);
        setEdges(SAMPLE_EDGES);
      }
      setFlowLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, flowLoaded]);

  const agent = agents.find((a) => a.id === agentId);
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = React.useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  function handleAddBlock(iconKey: IconKey, label: string) {
    const id = generateId();
    const newNode: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: { x: 520 + ((nodes.length * 30) % 120), y: 40 + ((nodes.length * 90) % 640) },
      data: { iconKey, label },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
  }

  function handleNodeDataChange(partial: Partial<FlowNodeData>) {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...partial } } : n)));
  }

  function handleDeleteNode() {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  async function handleSave() {
    await saveFlow(agentId, { nodes, edges });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1800);
  }

  if (!isLoaded || !flowLoaded) return <div className="flex-1 p-8" />;

  if (!agent) {
    return (
      <div className="flex-1 p-8 text-center">
        <p className="text-[15px] text-text-secondary">Agente não encontrado.</p>
        <Link href="/agent-studio" className="mt-3 inline-block text-[13px] font-medium text-text-secondary hover:text-text-primary">
          Voltar para o Eva Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/agent-studio/${agentId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={15} /> {agent.name}
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-text-primary">Builder de conversa</h1>
            <Badge variant="neutral">Beta</Badge>
          </div>
          <p className="mt-1 text-[13px] text-text-secondary">
            Clique num bloco pra editar, arraste das bordas pra conectar, adicione blocos pela paleta.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saveState === "saved" && <span className="text-[12.5px] text-text-tertiary">Salvo.</span>}
          <Link href="/playground" className={buttonVariants({ variant: "secondary", size: "md" })}>
            <PlayCircle size={15} /> Testar
          </Link>
          <button type="button" onClick={handleSave} className={buttonVariants({ variant: "solid", size: "md" })}>
            Salvar
          </button>
        </div>
      </div>

      <div className="glass-card relative flex-1 overflow-hidden rounded-3xl">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={NODE_TYPES}
          defaultEdgeOptions={{ type: "smoothstep" }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.4}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.07)" />
          <Controls showInteractive={false} position="bottom-left" />
          <Panel position="top-right">
            <div className="flex flex-col items-end gap-3">
              {selectedNode && (
                <NodeInspector
                  node={selectedNode}
                  onChange={handleNodeDataChange}
                  onDelete={handleDeleteNode}
                  onClose={() => setSelectedId(null)}
                />
              )}
              <BlockPalette onAdd={handleAddBlock} />
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
