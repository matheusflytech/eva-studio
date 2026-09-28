"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, PlayCircle, PanelRightClose, PanelRightOpen, LayoutGrid, LayoutTemplate, History,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FlowNode, type FlowNodeData, type NodeRunState } from "@/components/agent-studio/builder/flow-node";
import { BlockPalette } from "@/components/agent-studio/builder/block-palette";
import { IssuesPanel } from "@/components/agent-studio/builder/issues-panel";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import { NodeInspector } from "@/components/agent-studio/builder/node-inspector";
import { LivePreview } from "@/components/agent-studio/builder/live-preview";
import { SAMPLE_NODES, SAMPLE_EDGES } from "@/components/agent-studio/builder/flow-data";
import { getBlockDefault } from "@/components/agent-studio/builder/block-defaults";
import { BLOCK_MINIMAP_COLOR } from "@/components/agent-studio/builder/block-styles";
import { autoLayoutNodes } from "@/components/agent-studio/builder/auto-layout";
import { FlowTemplateGallery } from "@/components/agent-studio/builder/flow-template-gallery";
import type { FlowTemplate } from "@/components/agent-studio/builder/flow-templates";
import { FlowEdge } from "@/components/agent-studio/builder/flow-edge";
import { ExecutionsPanel } from "@/components/agent-studio/builder/executions-panel";
import { ConversationMode } from "@/components/agent-studio/builder/conversation-mode";
import { getFlow, saveFlow } from "@/lib/data/flows";
import { generateId } from "@/lib/utils";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";

type SaveState = "idle" | "pending" | "saved" | "error";
type BuilderTab = "editor" | "conversa" | "executions";

interface UltimaExecucao {
  createdAt: string;
  status: "success" | "error";
  porNo: Record<string, NodeRunState>;
}

const edgeTypes = { plusEdge: FlowEdge };

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
  const [tab, setTab] = React.useState<BuilderTab>("editor");
  const [ultimaExecucao, setUltimaExecucao] = React.useState<UltimaExecucao | null>(null);
  const [mostrarExecucao, setMostrarExecucao] = React.useState(true);
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

  // Última execução, pra pintar o canvas. Recarrega junto com a aba Editor
  // em vez de ficar em polling: quem quer acompanhar ao vivo usa o Playground.
  React.useEffect(() => {
    if (!agentId) return;
    let vivo = true;
    fetch(`/api/agents/${agentId}/executions?limit=1`)
      .then((r) => r.json())
      .then((d) => {
        const ex = d.executions?.[0];
        if (!vivo || !ex) return;
        const porNo: Record<string, NodeRunState> = {};
        for (const passo of ex.steps ?? []) {
          // Um mesmo nó pode aparecer duas vezes (laço). Fica a última, que é
          // o estado em que a conversa realmente parou.
          porNo[passo.nodeId] = { ok: !passo.error, ms: passo.ms ?? 0, error: passo.error };
        }
        setUltimaExecucao({ createdAt: ex.createdAt, status: ex.status, porNo });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [agentId, tab]);

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

  function handleAddAfter(afterNodeId: string | null, iconKey: IconKey) {
    const id = generateId();
    const defaults = getBlockDefault(iconKey)?.data ?? {};
    const anterior = afterNodeId ? nodes.find((n) => n.id === afterNodeId) : null;
    const novo: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: anterior
        ? { x: anterior.position.x + 320, y: anterior.position.y }
        : { x: 120, y: 120 },
      data: { iconKey, label: iconKey, ...defaults },
    };
    setNodes((nds) => [...nds, novo]);

    // Se o bloco âncora já continuava pra algum lugar, o novo entra no meio
    // em vez de virar um segundo fio saindo do mesmo ponto — dois fios na
    // mesma saída é fluxo ambíguo, e o motor segue só o primeiro.
    const continuacao = afterNodeId
      ? edges.find((e) => e.source === afterNodeId && !e.sourceHandle && e.targetHandle !== "tools")
      : undefined;

    if (afterNodeId) {
      setEdges((eds) => [
        ...eds.filter((e) => e.id !== continuacao?.id),
        { id: generateId(), source: afterNodeId, target: id },
        ...(continuacao ? [{ id: generateId(), source: id, target: continuacao.target }] : []),
      ]);
    }
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

    // Apagar um bloco do meio costurava o fluxo ao contrário: sumia o bloco e
    // sumia a continuação junto, deixando o resto do fluxo pendurado sem
    // ninguém apontando pra ele. Se o bloco tinha uma entrada e uma saída
    // simples, quem entrava nele passa a entrar em quem vinha depois.
    const entrada = edges.find((e) => e.target === selectedId && e.targetHandle !== "tools");
    const saidas = edges.filter((e) => e.source === selectedId && e.targetHandle !== "tools");
    const remendo =
      entrada && saidas.length === 1
        ? [{ id: generateId(), source: entrada.source, sourceHandle: entrada.sourceHandle, target: saidas[0].target }]
        : [];

    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => [
      ...eds.filter((e) => e.source !== selectedId && e.target !== selectedId),
      ...remendo,
    ]);
    setSelectedId(null);
  }

  function handleAutoLayout() {
    setNodes((nds) => autoLayoutNodes(nds, edges));
  }

  // Botão "+" no meio de uma conexão (flow-edge.tsx) — insere o bloco escolhido
  // no meio dela, plugando automaticamente antes/depois, igual n8n.
  function handleInsertOnEdge(edge: Edge, iconKey: IconKey) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const id = generateId();
    const defaults = getBlockDefault(iconKey)?.data ?? {};
    const newNode: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: {
        x: sourceNode && targetNode ? (sourceNode.position.x + targetNode.position.x) / 2 : 400,
        y: sourceNode && targetNode ? (sourceNode.position.y + targetNode.position.y) / 2 : 200,
      },
      data: { iconKey, label: iconKey, ...defaults },
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [
      ...eds.filter((e) => e.id !== edge.id),
      { id: generateId(), source: edge.source, sourceHandle: edge.sourceHandle, target: id },
      { id: generateId(), source: id, target: edge.target, targetHandle: edge.targetHandle },
    ]);
    setSelectedId(id);
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

  const edgesForCanvas = React.useMemo(
    () =>
      edges.map((e) =>
        e.targetHandle === "tools"
          ? e
          : { ...e, type: "plusEdge", data: { onInsert: (iconKey: IconKey) => handleInsertOnEdge(e, iconKey) } }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges]
  );

  const nodeTypes = React.useMemo(
    () => ({
      flowNode: (props: NodeProps<Node<FlowNodeData>>) => (
        <FlowNode
          data={props.data}
          selected={props.selected}
          run={mostrarExecucao ? ultimaExecucao?.porNo[props.id] : undefined}
          onDetailChange={(text) => handleNodeDataChangeById(props.id, { detail: text })}
        />
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mostrarExecucao, ultimaExecucao]
  );

  const issues = validateFlow(nodes, edges);

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
            {tab === "conversa"
              ? "O fluxo visto como a conversa que o cliente vai ter. Clique numa bolha pra editar o bloco."
              : "Clique num bloco pra editar, arraste das bordas pra conectar, adicione blocos pela paleta."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tab === "editor" && <IssuesPanel issues={issues} onSelect={setSelectedId} />}
          {tab === "editor" && (
            <span className="text-[12.5px] text-text-tertiary">
              {saveState === "pending" && "Salvando..."}
              {saveState === "saved" && "Salvo."}
              {saveState === "error" && <span className="text-danger">Erro ao salvar.</span>}
            </span>
          )}
          {tab === "editor" && (
            <>
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
              {ultimaExecucao && (
                <button
                  type="button"
                  onClick={() => setMostrarExecucao((v) => !v)}
                  title={`Última execução em ${new Date(ultimaExecucao.createdAt).toLocaleString("pt-BR")}`}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "md" }),
                    mostrarExecucao && "border-accent-500/40 text-text-primary"
                  )}
                >
                  <History size={15} />
                  Última execução
                  {ultimaExecucao.status === "error" && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-danger" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                {showPreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} Prévia
              </button>
            </>
          )}
          <Link href={`/playground?agent=${agentId}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <PlayCircle size={15} /> Playground
          </Link>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-border-subtle">
        {([
          { key: "editor", label: "Editor" },
          { key: "conversa", label: "Modo Conversa" },
          { key: "executions", label: "Execuções" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === t.key
                ? "border-accent-500 text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "editor" ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="glass-card relative flex-1 overflow-hidden rounded-3xl">
            <ReactFlow
              nodes={nodes}
              edges={edgesForCanvas}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "smoothstep" }}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.4}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.07)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(node) => BLOCK_MINIMAP_COLOR[(node.data as FlowNodeData).iconKey] ?? "#666"}
                nodeStrokeWidth={0}
                maskColor="rgba(0,0,0,0.55)"
              />
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
      ) : tab === "conversa" ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <ConversationMode
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            agentName={agent.name}
            onSelect={setSelectedId}
            onAddAfter={handleAddAfter}
          />
          {selectedNode && (
            <div className="shrink-0 overflow-y-auto">
              <NodeInspector
                node={selectedNode}
                agentId={agentId}
                variables={availableVariables}
                onChange={handleNodeDataChange}
                onDelete={handleDeleteNode}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <ExecutionsPanel agentId={agentId} />
      )}

      {showTemplateGallery && (
        <FlowTemplateGallery onPick={handlePickTemplate} onClose={() => setShowTemplateGallery(false)} />
      )}
    </div>
  );
}
