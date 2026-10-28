"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useParams } from "@/lib/contrato/navegacao";
import {
  ArrowLeft, Download, Ellipsis, PlayCircle, PanelRightClose, PanelRightOpen, LayoutGrid, LayoutTemplate, Maximize, Minus, Plus, Upload,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, useReducedMotion } from "framer-motion";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { cn } from "@/lib/utils";
import {
  CSS_DO_FLUXO_DO_AGENTE,
  CanvasDoAgenteContext,
  NoDoFluxo,
  type CanvasDoAgente,
  type FlowNodeData,
  type NodeRunState,
} from "@/components/agent-studio/builder/flow-node";
import { BlockPalette } from "@/components/agent-studio/builder/block-palette";
import { IssuesPanel } from "@/components/agent-studio/builder/issues-panel";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import { NodeInspector } from "@/components/agent-studio/builder/node-inspector";
import { LivePreview } from "@/components/agent-studio/builder/live-preview";
import { SAMPLE_NODES, SAMPLE_EDGES } from "@/components/agent-studio/builder/flow-data";
import { getBlockDefault } from "@/components/agent-studio/builder/block-defaults";
import { organizarFluxo } from "@/components/agent-studio/builder/auto-layout";
import { ehFerramenta, saidaDaLigacao, saidaParaNovoBloco, saidasDoBloco, temSaidasNomeadas } from "@/components/agent-studio/builder/saidas";
import { useCanvasTheme } from "@/components/ui/theme";
import { FlowTemplateGallery } from "@/components/agent-studio/builder/flow-template-gallery";
import type { FlowTemplate } from "@/components/agent-studio/builder/flow-templates";
import { FlowEdge, ToolEdge } from "@/components/agent-studio/builder/flow-edge";
import { ExecutionsPanel } from "@/components/agent-studio/builder/executions-panel";
import { ReportsPanel } from "@/components/agent-studio/builder/reports-panel";
import { ConversationMode } from "@/components/agent-studio/builder/conversation-mode";
import { MontarComIa } from "@/components/agent-studio/builder/montar-com-ia";
import { createSubflow, deleteSubflow, exportBundle, getFlow, getSubflow, importBundle, listSubflows, saveFlow, saveSubflow, type AgentFlow, type Subfluxo } from "@/lib/data/flows";
import { BarraDeFluxos } from "@/components/agent-studio/builder/barra-de-fluxos";
import { generateId } from "@/lib/utils";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";
import { MOLA } from "@/lib/design-system/movimento";

type SaveState = "idle" | "pending" | "saved" | "error";
type BuilderTab = "editor" | "conversa" | "executions" | "reports";

interface UltimaExecucao {
  createdAt: string;
  status: "success" | "error";
  porNo: Record<string, NodeRunState>;
}

// Fora do componente: nodeTypes/edgeTypes estáveis. A execução chega aos nós
// pelo CanvasDoAgenteContext; recriar o nodeTypes desmontava todos os nós.
const nodeTypes = { flowNode: NoDoFluxo };
const edgeTypes = { plusEdge: FlowEdge, ferramenta: ToolEdge };

// Cores do React Flow pelas variáveis dele (sem mexer no CSS global): quadro
// transparente sobre o fundo do contêiner, minimapa nos tokens.
const ESTILO_DO_QUADRO = {
  "--xy-background-color": "transparent",
  "--xy-minimap-background-color": "var(--surface-panel)",
  "--xy-minimap-mask-background-color": "color-mix(in srgb, var(--surface-page) 70%, transparent)",
  "--xy-edge-label-background-color": "var(--surface-page)",
} as React.CSSProperties;

// O CSS global pinta o minimapa com !important (fundo elevado, máscara
// escura com contorno forte). Aqui, com prefixo próprio, ele fica discreto.
const CSS_DO_MINIMAPA = `
.fluxo-agente .react-flow__minimap { background: var(--surface-panel) !important; }
.fluxo-agente .react-flow__minimap-mask { fill: color-mix(in srgb, var(--surface-page) 70%, transparent) !important; stroke: var(--border-default) !important; stroke-width: 1px; }
`;

// Barra flutuante embaixo, no centro (mesmo padrão do canvas de automações):
// zoom, enquadrar e organizar numa cápsula só.
function BarraFlutuante({ onOrganizar }: { onOrganizar: () => void }) {
  const rf = useReactFlow();
  const calmo = useReducedMotion();
  return (
    <Panel position="bottom-center" className="!mb-4">
      <motion.div
        initial={calmo ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...MOLA, delay: 0.15 }}
        role="toolbar"
        aria-label="Ferramentas do fluxo"
        className="flex items-center gap-0.5 rounded-full border border-border-default bg-overlay p-1 shadow-[var(--elevation-overlay)]"
      >
        <IconButton aria-label="Diminuir o zoom" tooltip onClick={() => void rf.zoomOut({ duration: 200 })}>
          <Minus />
        </IconButton>
        <IconButton aria-label="Aumentar o zoom" tooltip onClick={() => void rf.zoomIn({ duration: 200 })}>
          <Plus />
        </IconButton>
        <IconButton aria-label="Enquadrar o fluxo" tooltip onClick={() => void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 })}>
          <Maximize />
        </IconButton>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border-default" />
        <IconButton aria-label="Organizar os blocos" tooltip onClick={onOrganizar}>
          <LayoutGrid />
        </IconButton>
      </motion.div>
    </Panel>
  );
}

export default function AgentBuilderPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { agents, isLoaded, load } = useAgentsStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(SAMPLE_EDGES);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [flowLoaded, setFlowLoaded] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [erroAoSalvar, setErroAoSalvar] = React.useState<string | null>(null);
  // Canvas claro no tema claro e escuro no escuro, ou sempre escuro se a
  // pessoa marcou isso em Configurações → Sua conta.
  const { resolved: temaDoCanvas } = useCanvasTheme();
  const [showPreview, setShowPreview] = React.useState(false);
  const [paletaRecolhida, setPaletaRecolhida] = React.useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = React.useState(false);
  const [tab, setTab] = React.useState<BuilderTab>("editor");
  const [ultimaExecucao, setUltimaExecucao] = React.useState<UltimaExecucao | null>(null);
  const [mostrarExecucao, setMostrarExecucao] = React.useState(true);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Vários fluxos (S4): o canvas mostra um por vez. alvoDoSalvamento diz para
  // onde o autosave manda o que está na tela (null = Principal).
  const [fluxos, setFluxos] = React.useState<Subfluxo[]>([]);
  const [fluxoAtual, setFluxoAtual] = React.useState<string | null>(null);
  const [trocando, setTrocando] = React.useState(false);
  const alvoDoSalvamento = React.useRef<string | null>(null);
  const salvarEm = React.useCallback(
    (alvo: string | null, flow: AgentFlow) => (alvo ? saveSubflow(agentId, alvo, flow) : saveFlow(agentId, flow)),
    [agentId]
  );
  // Cascata de entrada dos blocos só nos primeiros instantes do canvas.
  const [abrindo, setAbrindo] = React.useState(true);
  React.useEffect(() => {
    if (!flowLoaded) return;
    const t = setTimeout(() => setAbrindo(false), 900);
    return () => clearTimeout(t);
  }, [flowLoaded]);

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

  React.useEffect(() => {
    if (!agentId) return;
    listSubflows(agentId).then(setFluxos).catch(() => {});
  }, [agentId]);

  /** Salva o que está na tela (se faltava) e abre outro fluxo. `recarregar`: abre de novo o mesmo (depois de importar). */
  async function trocarFluxo(id: string | null, recarregar = false) {
    if ((id === fluxoAtual && !recarregar) || trocando) return;
    setTrocando(true);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        await salvarEm(alvoDoSalvamento.current, { nodes, edges });
      }
      const flow = id ? await getSubflow(agentId, id) : await getFlow(agentId);
      alvoDoSalvamento.current = id;
      setNodes(flow?.nodes ?? SAMPLE_NODES);
      setEdges(flow?.edges ?? SAMPLE_EDGES);
      setSelectedId(null);
      setFluxoAtual(id);
      setErroAoSalvar(null);
    } catch (err) {
      setErroAoSalvar(err instanceof Error ? err.message : null);
      setSaveState("error");
    } finally {
      setTrocando(false);
    }
  }

  async function criarFluxo(nome: string) {
    try {
      const novo = await createSubflow(agentId, nome);
      setFluxos((fs) => [...fs, novo]);
      await trocarFluxo(novo.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível criar o fluxo.");
    }
  }

  async function mudarFluxo(id: string, parte: { name?: string; keywords?: string[] }) {
    try {
      await saveSubflow(agentId, id, parte);
      setFluxos(await listSubflows(agentId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível salvar o fluxo.");
    }
  }

  const arquivoRef = React.useRef<HTMLInputElement>(null);

  async function exportar() {
    try {
      const pacote = await exportBundle(agentId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fluxos-${(agent?.name ?? "agente").normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível exportar.");
    }
  }

  /**
   * Pacote "eva.flows" (o que o Exportar baixa): substitui o principal e os
   * fluxos de mesmo nome, no servidor. Só { nodes, edges }: troca o fluxo aberto.
   */
  async function importar(arquivo: File) {
    let json: unknown;
    try {
      json = JSON.parse(await arquivo.text());
    } catch {
      return alert("Esse arquivo não é um JSON válido.");
    }
    const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    if (o.format === "eva.flows") {
      const nomes = Array.isArray(o.subflows) ? o.subflows.length : 0;
      if (!confirm(`Importar substitui o fluxo Principal${nomes ? ` e os fluxos com o mesmo nome (${nomes} no arquivo)` : ""}. Continuar?`)) return;
      try {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const r = await importBundle(agentId, json);
        const lista = await listSubflows(agentId);
        setFluxos(lista);
        await trocarFluxo(fluxoAtual && lista.some((f) => f.id === fluxoAtual) ? fluxoAtual : null, true);
        const avisos = r.avisos.length ? `\n\n${r.avisos.length} aviso(s):\n${r.avisos.slice(0, 5).map((a) => "• " + a.message).join("\n")}` : "";
        alert(`Importado: ${r.criados} fluxo(s) criado(s), ${r.atualizados} atualizado(s).${avisos}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Não foi possível importar.");
      }
      return;
    }
    if (Array.isArray(o.nodes) && Array.isArray(o.edges)) {
      if (!confirm("Substituir o fluxo aberto pelo do arquivo?")) return;
      setNodes(o.nodes as Node<FlowNodeData>[]);
      setEdges(o.edges as Edge[]);
      setSelectedId(null);
      return;
    }
    alert('Esse arquivo não é uma exportação de fluxos da Eva (falta "format": "eva.flows" ou nodes e edges).');
  }

  async function apagarFluxo(id: string) {
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await deleteSubflow(agentId, id);
      setFluxos((fs) => fs.filter((f) => f.id !== id));
      alvoDoSalvamento.current = null; // não salva o canvas do fluxo apagado
      await trocarFluxo(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível apagar o fluxo.");
    }
  }

  // Última execução, pra pintar o canvas. Recarrega junto com a aba Editor
  // em vez de ficar em polling: quem quer acompanhar ao vivo usa o Playground.
  // A prévia ao vivo chama de novo a cada resposta: o canvas acende o
  // caminho que a conversa de teste acabou de fazer.
  const [rodadaDaPrevia, setRodadaDaPrevia] = React.useState(0);
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
  }, [agentId, tab, rodadaDaPrevia]);

  const agent = agents.find((a) => a.id === agentId);
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  // Aba Ferramentas do bloco de IA: o que está ligado na porta dele.
  const ferramentasDaIa =
    selectedNode?.data.iconKey === "ai-agent"
      ? edges
          .filter((e) => e.target === selectedNode.id && e.targetHandle === "tools")
          .flatMap((e) => nodes.filter((n) => n.id === e.source))
          .map((n) => ({ id: n.id, label: n.data.label, iconKey: n.data.iconKey }))
      : [];

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
    const alvo = alvoDoSalvamento.current;
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      try {
        await salvarEm(alvo, { nodes, edges });
        setErroAoSalvar(null);
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch (err) {
        // O servidor recusa só o que corrompe o fluxo (ligação para bloco que
        // não existe, sem Início...). A mensagem diz o quê.
        setErroAoSalvar(err instanceof Error ? err.message : null);
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
      (n) => !edges.some((e) => e.source === n.id) && !ehFerramenta(n.data.iconKey) && saidasDoBloco(n.data).length > 0
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

  /**
   * Ferramenta não é passo do fluxo: ela pendura na porta de ferramentas de
   * uma IA. Antes entrava como "próximo passo" (ficava solta e ainda apagava
   * o fio que saía da IA). Vai para a IA selecionada, a IA da ferramenta
   * selecionada ou, sem nenhuma das duas, a última IA do fluxo.
   */
  function adicionarFerramenta(ancoraId: string | null, iconKey: IconKey) {
    const id = generateId();
    const ancoraNo = ancoraId ? nodes.find((n) => n.id === ancoraId) : null;
    const iaDaFerramenta =
      ancoraNo && ehFerramenta(ancoraNo.data.iconKey)
        ? edges.find((e) => e.source === ancoraNo.id && e.targetHandle === "tools")?.target
        : undefined;
    const ia =
      (ancoraNo?.data.iconKey === "ai-agent" ? ancoraNo : null) ??
      nodes.find((n) => n.id === iaDaFerramenta) ??
      [...nodes].reverse().find((n) => n.data.iconKey === "ai-agent") ??
      null;
    const novo: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: ia ? vagaLivre(ia.position.x, ia.position.y + 200) : vagaLivre(120, 120),
      data: { iconKey, label: iconKey, ...(getBlockDefault(iconKey)?.data ?? {}) },
    };
    setNodes((nds) => [...nds, novo]);
    if (ia) setEdges((eds) => [...eds, { id: generateId(), source: id, target: ia.id, targetHandle: "tools" }]);
    setSelectedId(id);
  }

  /** "+" de uma saída livre no canvas: o bloco novo nasce ligado nela. */
  function adicionarNaSaida(noId: string, saida: string | null, iconKey: IconKey) {
    const anterior = nodes.find((n) => n.id === noId);
    if (!anterior) return;
    const id = generateId();
    const novo: Node<FlowNodeData> = {
      id,
      type: "flowNode",
      position: vagaLivre(anterior.position.x + 320, anterior.position.y),
      data: { iconKey, label: iconKey, ...(getBlockDefault(iconKey)?.data ?? {}) },
    };
    setNodes((nds) => [...nds, novo]);
    setEdges((eds) => [...eds, { id: generateId(), source: noId, target: id, ...(saida ? { sourceHandle: saida } : {}) }]);
    setSelectedId(id);
  }

  // Os nós chamam pelo contexto; a ref evita recriar o contexto (e redesenhar
  // todos os nós) a cada mudança de nodes/edges.
  const acoesDoCanvas = React.useRef({ adicionarNaSaida, adicionarFerramenta });
  acoesDoCanvas.current = { adicionarNaSaida, adicionarFerramenta };

  function handleAddAfter(afterNodeId: string | null, iconKey: IconKey) {
    if (ehFerramenta(iconKey)) return adicionarFerramenta(afterNodeId, iconKey);
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

    // Ferramenta e Encerrar não têm saída no fluxo: o bloco novo entra solto.
    const ligavel = anterior && !ehFerramenta(anterior.data.iconKey) && saidasDoBloco(anterior.data).length > 0;
    if (anterior && ligavel) {
      // Sai pela saída certa: depois de uma Condição, o Sim (ou o Não, se o
      // Sim já está ligado); depois de um menu, a primeira opção livre. Antes
      // a ligação nascia sem saída e a conversa morria ali.
      const handle = saidaParaNovoBloco(anterior.data, anterior.id, edges);
      // Se essa saída já continuava pra algum lugar, o novo entra no meio
      // em vez de virar um segundo fio saindo do mesmo ponto — dois fios na
      // mesma saída é fluxo ambíguo, e o motor segue só o primeiro.
      const continuacao = edges.find(
        (e) => e.source === anterior.id && (e.sourceHandle ?? undefined) === handle && e.targetHandle !== "tools"
      );
      const saidaDoNovo = saidaParaNovoBloco(novo.data, id, []);
      // Bloco sem saída (Encerrar) no meio: não dá para religar o que vinha
      // depois, então ele entra solto em vez de cortar o fluxo.
      if (continuacao && saidasDoBloco(novo.data).length === 0) {
        setSelectedId(id);
        return;
      }
      setEdges((eds) => [
        ...eds.filter((e) => e.id !== continuacao?.id),
        { id: generateId(), source: anterior.id, target: id, ...(handle ? { sourceHandle: handle } : {}) },
        ...(continuacao && saidasDoBloco(novo.data).length > 0
          ? [{ id: generateId(), source: id, target: continuacao.target, ...(saidaDoNovo ? { sourceHandle: saidaDoNovo } : {}) }]
          : []),
      ]);
    }
    setSelectedId(id);
  }

  function handleNodeDataChangeById(id: string, partial: Partial<FlowNodeData>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...partial } } : n)));
    // Opção de menu apagada (ou tipo de resposta trocado): a ligação que saía
    // dela não tem mais de onde sair. Sem isto ela ficava presa num ponto que
    // não existe e o salvamento acusava "saída que não existe".
    if ("options" in partial || "captureField" in partial || "aiExits" in partial || "exitConditions" in partial || "waitForReply" in partial || "replyTimeoutMinutes" in partial) {
      const atual = nodes.find((n) => n.id === id);
      if (!atual) return;
      const novo = { ...atual.data, ...partial } as FlowNodeData;
      setEdges((eds) =>
        eds.filter((e) => e.source !== id || !e.sourceHandle || e.targetHandle === "tools" || !!saidaDaLigacao(novo, e.sourceHandle))
      );
    }
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

  // "Organizar": esquerda→direita, com a altura que cada cartão tem na tela
  // (node.measured), Sim em cima, opções na ordem. Mesma função que a API v1,
  // a IA e os modelos prontos usam.
  function handleAutoLayout() {
    setNodes((nds) => organizarFluxo(nds, edges));
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
    // O bloco inserido continua pela primeira saída dele (Sim, se for Condição).
    const saidaDoNovo = saidaParaNovoBloco(newNode.data, id, []);
    setEdges((eds) => [
      ...eds.filter((e) => e.id !== edge.id),
      { id: generateId(), source: edge.source, sourceHandle: edge.sourceHandle, target: id },
      ...(saidasDoBloco(newNode.data).length > 0
        ? [{ id: generateId(), source: id, target: edge.target, targetHandle: edge.targetHandle, ...(saidaDoNovo ? { sourceHandle: saidaDoNovo } : {}) }]
        : []),
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

  // Cada ligação ganha o nome da saída de onde parte (Sim, Não, a opção do
  // menu...), mostrado numa pílula no meio dela.
  // O fio acende quando a última execução passou pelos dois blocos dele
  // (a origem rodou sem erro e o destino rodou depois).
  const execucaoNoCanvas = mostrarExecucao ? ultimaExecucao?.porNo : undefined;
  const edgesForCanvas = React.useMemo(
    () =>
      edges.map((e) => {
        // Só o tipo de render muda aqui; o que é salvo continua sendo `edges`.
        if (e.targetHandle === "tools") return { ...e, type: "ferramenta" };
        const origem = nodes.find((n) => n.id === e.source);
        const saida = origem && temSaidasNomeadas(origem.data) ? saidaDaLigacao(origem.data, e.sourceHandle) : null;
        return {
          ...e,
          type: "plusEdge",
          data: {
            onInsert: (iconKey: IconKey) => handleInsertOnEdge(e, iconKey),
            rotulo: saida?.rotulo ?? null,
            tipo: saida?.tipo,
            ativa: !!execucaoNoCanvas?.[e.source]?.ok && !!execucaoNoCanvas?.[e.target],
          },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodes, execucaoNoCanvas]
  );

  // Ferramenta só liga na porta de ferramentas de um bloco de IA, e nada
  // além de ferramenta liga nela.
  const ligacaoValida = React.useCallback(
    (c: Connection | Edge) => {
      const origem = nodes.find((n) => n.id === c.source);
      if (!origem) return false;
      return ehFerramenta(origem.data.iconKey) ? c.targetHandle === "tools" : c.targetHandle !== "tools";
    },
    [nodes]
  );

  // Ponto de partida da cascata de entrada (coluna mais à esquerda na carga).
  const xInicial = React.useMemo(
    () => (nodes.length ? Math.min(...nodes.map((n) => n.position.x)) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowLoaded]
  );
  const contextoDoCanvas = React.useMemo<CanvasDoAgente>(
    () => ({
      execucao: execucaoNoCanvas,
      abrindo,
      xInicial,
      adicionarNaSaida: (noId, saida, k) => acoesDoCanvas.current.adicionarNaSaida(noId, saida, k),
      adicionarFerramenta: (iaId, k) => acoesDoCanvas.current.adicionarFerramenta(iaId, k),
    }),
    [execucaoNoCanvas, abrindo, xInicial]
  );

  // Abre legível: se o fluxo inteiro cabe com zoom de leitura, mostra tudo;
  // senão começa pelo Início (viewportInicial) em vez de virar miniatura.
  const canvasRef = React.useRef<HTMLDivElement>(null);
  function abrirLegivel(caixaDoFluxo: () => { width: number; height: number } | null, enquadrar: () => void) {
    setTimeout(() => {
      const el = canvasRef.current;
      const caixa = caixaDoFluxo();
      if (!el || !caixa) return;
      const zoom = Math.min(el.clientWidth / (caixa.width + 160), el.clientHeight / (caixa.height + 160));
      if (zoom >= 0.6) enquadrar();
    }, 80);
  }

  const issues = validateFlow(nodes, edges, { temUrlDoFluxo: agent ? !!agent.webhook.outboundUrl.trim() : undefined });

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
    // Só na carga (e ao trocar de fluxo): recalcular a cada mexida no nó
    // faria o canvas pular debaixo da mão de quem está arrastando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowLoaded, fluxoAtual]);

  if (!isLoaded || !flowLoaded) return <div className="flex-1" />;

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-4 py-14 text-center">
        <p className="text-body text-text-secondary">Agente não encontrado.</p>
        <Link href="/agent-studio" className="text-small font-medium text-accent-fg hover:underline">
          Voltar para Eva Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-1 lg:px-6">
      {/* Barra do Builder (v5): voltar, agente, modo e, à direita, o estado do
          fluxo, a IA, Testar e o "…" com o resto (modelos, organizar, última
          execução, Playground). */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/agent-studio/${agentId}`}
            aria-label="Voltar para o agente"
            className={buttonVariants({ variant: "ghost", size: "icon", className: "-ml-1.5 shrink-0" })}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
          <OrbeDoAgente agenteId={agent.id} tamanho={28} leve />
          <h1 className="min-w-0 truncate text-heading font-semibold tracking-tight text-text-primary">{agent.name}</h1>
        </div>

        <SegmentedControl
          label="Modo do Builder"
          value={tab}
          onChange={setTab}
          options={[
            { value: "editor", label: "Editor" },
            { value: "conversa", label: "Conversa" },
            { value: "executions", label: "Execuções" },
            { value: "reports", label: "Relatórios" },
          ]}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {tab === "editor" && (
            <span className="font-mono text-caption text-text-tertiary" aria-live="polite">
              {saveState === "pending" && "salvando…"}
              {saveState === "saved" && "salvo"}
              {saveState === "error" && (
                <span className="text-danger" title={erroAoSalvar ?? undefined}>
                  {erroAoSalvar ? `não salvou: ${erroAoSalvar}` : "erro ao salvar"}
                </span>
              )}
            </span>
          )}
          {tab === "editor" && <IssuesPanel issues={issues} onSelect={setSelectedId} />}
          {tab === "editor" && (
            <MontarComIa
              agentId={agentId}
              nodes={nodes}
              edges={edges}
              onAplicar={(novosNos, novasLigacoes) => {
                setNodes(novosNos);
                setEdges(novasLigacoes);
                setSelectedId(null);
              }}
            />
          )}
          {tab === "editor" && (
            <Button
              variant="secondary"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
              title={showPreview ? "Esconder a prévia" : "Testar a conversa ao vivo"}
            >
              {showPreview ? <PanelRightClose size={14} aria-hidden="true" /> : <PanelRightOpen size={14} aria-hidden="true" />}
              <span className="hidden sm:inline">{showPreview ? "Fechar teste" : "Testar"}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais: modelos, organizar, última execução, Playground" variant="secondary" className="relative">
                <Ellipsis />
                {/* A última execução falhou: o ponto avisa sem ocupar a barra. */}
                {tab === "editor" && ultimaExecucao?.status === "error" && (
                  <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-danger-solid" />
                )}
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {tab === "editor" && (
                <>
                  <DropdownMenuItem onSelect={() => setShowTemplateGallery(true)}>
                    <LayoutTemplate aria-hidden="true" /> Começar de um modelo pronto
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleAutoLayout}>
                    <LayoutGrid aria-hidden="true" /> Organizar os blocos
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportar()}>
                    <Download aria-hidden="true" /> Exportar fluxos (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => arquivoRef.current?.click()}>
                    <Upload aria-hidden="true" /> Importar JSON
                  </DropdownMenuItem>
                  {ultimaExecucao && (
                    <DropdownMenuCheckboxItem checked={mostrarExecucao} onCheckedChange={(v) => setMostrarExecucao(v === true)}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span>Mostrar a última execução</span>
                        <span className={cn("font-mono text-caption", ultimaExecucao.status === "error" ? "text-danger" : "text-text-tertiary")}>
                          {new Date(ultimaExecucao.createdAt).toLocaleString("pt-BR")}
                          {ultimaExecucao.status === "error" ? " · com erro" : ""}
                        </span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href={`/playground?agent=${agentId}`}>
                  <PlayCircle aria-hidden="true" /> Abrir no Playground
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(tab === "editor" || tab === "conversa") && (
        <BarraDeFluxos
          agentId={agentId}
          fluxos={fluxos}
          atual={fluxoAtual}
          ocupado={trocando}
          onTrocar={(id) => void trocarFluxo(id)}
          onCriar={(nome) => void criarFluxo(nome)}
          onRenomear={(id, name) => void mudarFluxo(id, { name })}
          onPalavras={(id, keywords) => void mudarFluxo(id, { keywords })}
          onApagar={(id) => void apagarFluxo(id)}
        />
      )}

      {tab === "editor" ? (
        <div className="relative flex min-h-0 flex-1 gap-3 overflow-hidden">
          <BlockPalette
            onAdd={handleAddBlock}
            ancora={ancora ? nodes.find((n) => n.id === ancora)?.data.label ?? null : null}
            recolhida={paletaRecolhida}
            onToggle={() => setPaletaRecolhida((v) => !v)}
          />
          {/* data-theme no contêiner: "canvas sempre escuro" vale também para
              os blocos (tokens), não só para o fundo do React Flow. */}
          <div
            data-theme={temaDoCanvas}
            ref={canvasRef}
            className="fluxo-agente relative flex-1 overflow-hidden rounded-[18px] border border-border-subtle bg-page text-text-primary"
          >
            <style>{CSS_DO_FLUXO_DO_AGENTE + CSS_DO_MINIMAPA}</style>
            <CanvasDoAgenteContext.Provider value={contextoDoCanvas}>
            <ReactFlow
              key={fluxoAtual ?? "main"}
              colorMode={temaDoCanvas}
              isValidConnection={ligacaoValida}
              nodes={nodes}
              edges={edgesForCanvas}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              // onNodeClick sozinho nao bastava: a selecao e a fonte da
              // verdade, venha de onde vier (clique, teclado, caixa de selecao).
              onSelectionChange={aoMudarSelecao}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineType={ConnectionLineType.Bezier}
              defaultViewport={viewportInicial}
              onInit={(rf) =>
                abrirLegivel(
                  () => (rf.getNodes().length ? rf.getNodesBounds(rf.getNodes()) : null),
                  () => void rf.fitView({ padding: 0.12, maxZoom: 0.9 })
                )
              }
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              style={ESTILO_DO_QUADRO}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="var(--border-default)" />
              <BarraFlutuante onOrganizar={handleAutoLayout} />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                className="!overflow-hidden !rounded-[14px] !border !border-border-subtle"
                style={{ width: 132, height: 84 }}
                nodeBorderRadius={14}
                nodeStrokeWidth={0}
                nodeColor={(node) =>
                  execucaoNoCanvas?.[node.id] && !execucaoNoCanvas[node.id].ok ? "var(--danger-solid)" : "var(--border-strong)"
                }
              />
            </ReactFlow>
            </CanvasDoAgenteContext.Provider>
          </div>

          {/* Coluna própria (como a paleta), não flutuando sobre o canvas:
              em tela grande ela cresce em vez de ficar espremida num canto. */}
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              agentId={agentId}
              variables={availableVariables}
              onChange={handleNodeDataChange}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedId(null)}
              ferramentas={ferramentasDaIa}
              aoAdicionarFerramenta={(iconKey) => adicionarFerramenta(selectedNode.id, iconKey)}
              aoAbrirBloco={setSelectedId}
              documentos={agent.knowledgeBase}
              fluxos={fluxos}
            />
          )}

          {showPreview && <LivePreview agentId={agentId} agentName={agent.name} aoResponder={() => setRodadaDaPrevia((n) => n + 1)} />}
        </div>
      ) : tab === "conversa" ? (
        <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden">
          <ConversationMode
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            agentName={agent.name}
            onSelect={setSelectedId}
            onAddAfter={handleAddAfter}
          />
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              agentId={agentId}
              variables={availableVariables}
              onChange={handleNodeDataChange}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedId(null)}
              ferramentas={ferramentasDaIa}
              aoAdicionarFerramenta={(iconKey) => adicionarFerramenta(selectedNode.id, iconKey)}
              aoAbrirBloco={setSelectedId}
              documentos={agent.knowledgeBase}
              fluxos={fluxos}
            />
          )}
        </div>
      ) : (
        tab === "reports" ? <ReportsPanel agentId={agentId} /> : <ExecutionsPanel agentId={agentId} />
      )}

      <input
        ref={arquivoRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importar(f);
        }}
      />

      {showTemplateGallery && (
        <FlowTemplateGallery onPick={handlePickTemplate} onClose={() => setShowTemplateGallery(false)} />
      )}
    </div>
  );
}
