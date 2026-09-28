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
  const [showPreview, setShowPreview] = React.useState(false);
  const [paletaRecolhida, setPaletaRecolhida] = React.useState(false);
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

  const aoMudarSelecao = React.useCallback(
    ({ nodes: selecionados }: { nodes: Node<FlowNodeData>[] }) =>
      setSelectedId((atual) => selecionados[0]?.id ?? (selecionados.length === 0 ? null : atual)),
    []
  );

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

  /**
   * Onde o próximo bloco se pendura: o bloco selecionado, ou a ponta do fluxo.
   *
   * Antes o bloco caía numa posição semi-aleatória e desconectado, e a pessoa
   * tinha que descobrir sozinha que precisava arrastar um fio da borda. Era o
   * maior motivo de o builder parecer difícil: cada bloco adicionado criava
   * uma tarefa extra em vez de continuar o trabalho.
   */
  const ancora = React.useMemo(() => {
    if (selectedId && nodes.some((n) => n.id === selectedId)) return selectedId;
    if (nodes.length === 0) return null;
    // Ponta: alguém sem saída, que não seja ferramenta pendurada num agente.
    const pontas = nodes.filter(
      (n) => !edges.some((e) => e.source === n.id) && !n.data.iconKey.startsWith("tool-")
    );
    return pontas[pontas.length - 1]?.id ?? nodes[nodes.length - 1].id;
  }, [selectedId, nodes, edges]);

  function handleAddBlock(iconKey: IconKey) {
    handleAddAfter(ancora, iconKey);
  }

  /**
   * Uma vaga livre a partir de (x, y).
   *
   * Sem isto o bloco novo nasce exatamente onde já tem outro e some por baixo
   * dele: a pessoa clica, "não acontece nada", clica de novo, e agora tem dois
   * blocos escondidos. Desce até achar espaço, que é o que qualquer editor de
   * diagrama faz.
   */
  function vagaLivre(x: number, y: number): { x: number; y: number } {
    const LARGURA = 260;
    const ALTURA = 130;
    let candidatoY = y;
    for (let tentativa = 0; tentativa < 40; tentativa += 1) {
      const ocupada = nodes.some(
        (n) =>
          Math.abs(n.position.x - x) < LARGURA && Math.abs(n.position.y - candidatoY) < ALTURA
      );
      if (!ocupada) return { x, y: candidatoY };
      candidatoY += ALTURA + 20;
    }
    return { x, y: candidatoY };
  }

  function handleAddAfter(afterNodeId: string | null, iconKey: IconKey) {
    const id = generateId();
    const defaults = getBlockDefault(iconKey)?.data ?? {};
    const anterior = afterNodeId ? nodes.find((n) => n.id === afterNodeId) : null;
    const novo: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: anterior
        ? vagaLivre(anterior.position.x + 320, anterior.position.y)
        : vagaLivre(120, 120),
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

  const viewportInicial = React.useMemo(() => {
    const ZOOM = 0.85;
    const inicio =
      nodes.find((n) => n.data.iconKey === "start") ??
      nodes.find((n) => !edges.some((e) => e.target === n.id)) ??
      nodes[0];
    if (!inicio) return { x: 0, y: 0, zoom: ZOOM };
    return {
      x: -inicio.position.x * ZOOM + 90,
      y: -inicio.position.y * ZOOM + 150,
      zoom: ZOOM,
    };
    // Só na carga: recalcular a cada mexida no nó faria o canvas pular
    // debaixo da mão de quem está arrastando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowLoaded]);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/agent-studio/${agentId}`}
            title="Voltar para o agente"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="truncate font-display text-lg font-semibold text-text-primary">{agent.name}</h1>

          {/* As abas moram no cabeçalho: uma barra só em vez de duas. */}
          <div className="flex items-center gap-0.5 rounded-xl bg-surface-2 p-1">
            {([
              { key: "editor", label: "Editor" },
              { key: "conversa", label: "Conversa" },
              { key: "executions", label: "Execuções" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  tab === t.key
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-tertiary hover:text-text-primary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
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
                title="Começar de um modelo pronto"
                className={buttonVariants({ variant: "secondary", size: "icon" })}
              >
                <LayoutTemplate size={15} />
              </button>
              <button
                type="button"
                onClick={handleAutoLayout}
                title="Reorganiza os blocos automaticamente"
                className={buttonVariants({ variant: "secondary", size: "icon" })}
              >
                <LayoutGrid size={15} />
              </button>
              {ultimaExecucao && (
                <button
                  type="button"
                  onClick={() => setMostrarExecucao((v) => !v)}
                  title={`Última execução em ${new Date(ultimaExecucao.createdAt).toLocaleString("pt-BR")}`}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "icon" }),
                    "relative",
                    mostrarExecucao && "border-accent-500/40 text-text-primary"
                  )}
                >
                  <History size={15} />
                  {ultimaExecucao.status === "error" && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-danger" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                title={showPreview ? "Esconder a prévia" : "Testar a conversa ao vivo"}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "icon" }),
                  showPreview && "border-accent-500/40 text-text-primary"
                )}
              >
                {showPreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </>
          )}
          <Link href={`/playground?agent=${agentId}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <PlayCircle size={15} /> Playground
          </Link>
        </div>
      </div>

      {tab === "editor" ? (
        <div className="flex flex-1 gap-3 overflow-hidden">
          <BlockPalette
            onAdd={handleAddBlock}
            ancora={ancora ? nodes.find((n) => n.id === ancora)?.data.label ?? null : null}
            recolhida={paletaRecolhida}
            onToggle={() => setPaletaRecolhida((v) => !v)}
          />
          <div className="glass-card relative flex-1 overflow-hidden rounded-3xl">
            <ReactFlow
              nodes={nodes}
              edges={edgesForCanvas}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              // onNodeClick sozinho nao bastava: bloco de mensagem tem campo de
              // texto editavel dentro, e clicar no texto selecionava o no no
              // canvas sem abrir o painel — parecia que o clique nao funcionava.
              // A selecao e a fonte da verdade, venha o clique de onde vier.
              onSelectionChange={aoMudarSelecao}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "smoothstep" }}
              defaultViewport={viewportInicial}
              minZoom={0.3}
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
