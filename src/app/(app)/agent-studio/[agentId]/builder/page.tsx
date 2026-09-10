"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, PlayCircle, PanelRightClose, PanelRightOpen, LayoutGrid, LayoutTemplate } from "lucide-react";
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
import type { Connection, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlowNode, type FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { BlockPalette } from "@/components/agent-studio/builder/block-palette";
import { NodeInspector } from "@/components/agent-studio/builder/node-inspector";
import { LivePreview } from "@/components/agent-studio/builder/live-preview";
import { SAMPLE_NODES, SAMPLE_EDGES } from "@/components/agent-studio/builder/flow-data";
import { getBlockDefault } from "@/components/agent-studio/builder/block-defaults";
import { autoLayoutNodes } from "@/components/agent-studio/builder/auto-layout";
import { FlowTemplateGallery } from "@/components/agent-studio/builder/flow-template-gallery";
import type { FlowTemplate } from "@/components/agent-studio/builder/flow-templates";
import { getFlow, saveFlow } from "@/lib/data/flows";
import { generateId } from "@/lib/utils";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";

type SaveState = "idle" | "pending" | "saved" | "error";

export default function AgentBuilderPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { agents, isLoaded, load } = useAgentsStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(SAMPLE_EDGES);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [flowLoaded, setFlowLoaded] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [showPreview, setShowPreview] = React.useState(true);
  const [showTemplateGallery, setShowTemplateGallery] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Nomes de variável já usados em blocos de Captura de input, Variável e
  // Chamar webhook — é isso que alimenta o seletor visual no inspector, pra
  // não precisar decorar/digitar o {nome} certo na mão em outros blocos.
  const availableVariables = React.useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.data.variableName) set.add(n.data.variableName);
    });
    return Array.from(set).sort();
  }, [nodes]);

  const onConnect = React.useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  // Autosave: qualquer mudança no canvas dispara um salvamento silencioso
  // depois de 900ms sem novas mudanças — sem botão "Salvar" pra lembrar de
  // clicar, e é o que faz a prévia ao vivo sempre bater com o que tá na tela.
  React.useEffect(() => {
    if (!flowLoaded) return;
    setSaveState("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveFlow(agentId, { nodes, edges });
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, flowLoaded, agentId]);

  function handleAddBlock(iconKey: IconKey) {
    const id = generateId();
    const defaults = getBlockDefault(iconKey)?.data ?? {};
    const newNode: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: { x: 520 + ((nodes.length * 30) % 120), y: 40 + ((nodes.length * 90) % 640) },
      data: { iconKey, label: iconKey, ...defaults },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
  }

  function handleNodeDataChangeById(id: string, partial: Partial<FlowNodeData>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...partial } } : n)));
  }

  function handleNodeDataChange(partial: Partial<FlowNodeData>) {
    if (!selectedId) return;
    handleNodeDataChangeById(selectedId, partial);
  }

  function handleDeleteNode() {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  function handleAutoLayout() {
    setNodes((nds) => autoLayoutNodes(nds, edges));
  }

  function handlePickTemplate(template: FlowTemplate) {
    if (!confirm(`Substituir o canvas atual pelo modelo "${template.name}"? As alterações não salvas se perdem.`)) {
      return;
    }
    const { nodes: newNodes, edges: newEdges } = template.build();
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedId(null);
    setShowTemplateGallery(false);
  }

  const nodeTypes = React.useMemo(
    () => ({
      flowNode: (props: NodeProps<Node<FlowNodeData>>) => (
        <FlowNode
          data={props.data}
          selected={props.selected}
          onDetailChange={(text) => handleNodeDataChangeById(props.id, { detail: text })}
        />
      ),
    }),
    []
  );

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
          <span className="text-[12.5px] text-text-tertiary">
            {saveState === "pending" && "Salvando..."}
            {saveState === "saved" && "Salvo."}
            {saveState === "error" && <span className="text-danger">Erro ao salvar.</span>}
          </span>
          <button
            type="button"
            onClick={() => setShowTemplateGallery(true)}
            className={buttonVariants({ variant: "secondary", size: "md" })}
          >
            <LayoutTemplate size={15} /> Modelos
          </button>
          <button
            type="button"
            onClick={handleAutoLayout}
            className={buttonVariants({ variant: "secondary", size: "md" })}
            title="Reorganiza os blocos automaticamente"
          >
            <LayoutGrid size={15} /> Organizar
          </button>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={buttonVariants({ variant: "secondary", size: "md" })}
          >
            {showPreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} Prévia
          </button>
          <Link href={`/playground?agent=${agentId}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <PlayCircle size={15} /> Playground
          </Link>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="glass-card relative flex-1 overflow-hidden rounded-3xl">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
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
                    agentId={agentId}
                    variables={availableVariables}
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

        {showPreview && <LivePreview agentId={agentId} agentName={agent.name} />}
      </div>

      {showTemplateGallery && (
        <FlowTemplateGallery onPick={handlePickTemplate} onClose={() => setShowTemplateGallery(false)} />
      )}
    </div>
  );
}
