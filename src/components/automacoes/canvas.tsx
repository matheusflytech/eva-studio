"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { useCanvasTheme } from "@/components/ui/theme";
import { acaoDoTipo, configPadrao, gatilhoDoTipo, textoDaDuracao, type Nomes } from "@/lib/automacoes/catalogo";
import { fraseDaRegra } from "@/lib/automacoes/frase";
import { layoutDaAutomacao } from "@/lib/automacoes/layout";
import { EVENTOS_DE_ESPERA } from "@/lib/automacoes/catalogo";
import type { Definicao, No, Ponta } from "@/lib/automacoes/tipos";
import type { Pendencia } from "@/lib/automacoes/validar";
import { visualDoPasso } from "./comum";

// ---------------------------------------------------------------------------
// Canvas da automação: layout automático da esquerda para a direita (puro, em
// layout.ts), sem arrastar nem ligar fio à mão. O "+" no meio de cada ligação
// e nos espaços vazios abre o seletor de passo. `estados` pinta cada nó durante
// uma execução (parte F: ao vivo).
// ---------------------------------------------------------------------------

export type EstadoDoNo = "rodando" | "ok" | "falhou" | "pulado" | "esperando";

interface DadosDoPasso extends Record<string, unknown> {
  tipo: string;
  acao?: string;
  titulo: string;
  subtitulo: string;
  pendencias: number;
  selecionado: boolean;
  estado?: EstadoDoNo;
  ms?: number;
}

interface DadosDoVazio extends Record<string, unknown> {
  ponta: Ponta;
  inserir: (p: Ponta) => void;
}

interface DadosDaLigacao extends Record<string, unknown> {
  nome: string;
  ponta: Ponta;
  paraVazio: boolean;
  inserir: (p: Ponta) => void;
  ativa?: boolean;
}

const ANEL: Record<EstadoDoNo, string> = {
  rodando: "ring-2 ring-info animate-pulse",
  ok: "ring-2 ring-success",
  falhou: "ring-2 ring-danger",
  pulado: "ring-2 ring-border-strong",
  esperando: "ring-2 ring-warning",
};

function CartaoDoPasso({ data }: NodeProps<Node<DadosDoPasso>>) {
  const v = visualDoPasso(data.tipo, data.acao);
  const Icone = v.icone;
  return (
    <div
      className={cn(
        "relative flex h-[78px] w-[264px] cursor-pointer items-center gap-3 rounded-xl border bg-raised px-3 shadow-sm transition-shadow",
        data.selecionado ? "border-accent-solid shadow-md" : "border-border-default hover:border-border-strong",
        data.estado && ANEL[data.estado]
      )}
    >
      {data.tipo !== "gatilho" && <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-border-strong" isConnectable={false} />}
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", CATEGORY_CLASSES[v.cor].subtle, CATEGORY_CLASSES[v.cor].fg)}>
        <Icone size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-mono text-[9.5px] uppercase tracking-[0.14em]", CATEGORY_CLASSES[v.cor].fg)}>{v.categoria}</p>
        <p className="truncate text-[13px] font-semibold text-text-primary" title={data.titulo}>{data.titulo}</p>
        <p className="truncate text-[11.5px] text-text-secondary" title={data.subtitulo}>{data.subtitulo}</p>
      </div>
      {data.pendencias > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1 text-[10.5px] font-semibold text-text-on-danger" title="Pendências">
          <AlertCircle size={11} />
        </span>
      )}
      {data.ms !== undefined && <span className="absolute -bottom-2 right-3 rounded-full bg-surface-3 px-1.5 font-mono text-[10px] text-text-secondary">{data.ms} ms</span>}
      {data.tipo !== "fim" && <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-border-strong" isConnectable={false} />}
    </div>
  );
}

function EspacoVazio({ data }: NodeProps<Node<DadosDoVazio>>) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        data.inserir(data.ponta);
      }}
      className="flex h-[44px] w-[160px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-[12.5px] text-text-tertiary transition-colors hover:border-accent-solid hover:text-accent-fg"
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" isConnectable={false} />
      <Plus size={14} /> Passo
    </button>
  );
}

function Ligacao({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<DadosDaLigacao>>) {
  const [caminho, x, y] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={caminho} style={{ stroke: data?.ativa ? "var(--info)" : "var(--border-strong)", strokeWidth: data?.ativa ? 2 : 1.5 }} className={data?.ativa ? "automacao-ligacao-ativa" : undefined} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
          {data?.nome && <span className="rounded-full border border-border-subtle bg-panel px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">{data.nome}</span>}
          {data && !data.paraVazio && (
            <button
              type="button"
              aria-label="Inserir passo aqui"
              onClick={(e) => {
                e.stopPropagation();
                data.inserir(data.ponta);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-panel text-text-tertiary opacity-70 transition hover:border-accent-solid hover:text-accent-fg hover:opacity-100"
            >
              <Plus size={11} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const TIPOS_DE_NO = { passo: CartaoDoPasso, vazio: EspacoVazio };
const TIPOS_DE_LIGACAO = { ligacao: Ligacao };

/** Título e resumo do cartão de cada passo. */
export function resumoDoPasso(def: Definicao, no: No, nomes: Nomes): { titulo: string; subtitulo: string } {
  switch (no.tipo) {
    case "acao": {
      const item = acaoDoTipo(no.acao);
      return { titulo: no.rotulo || item?.nome || no.acao, subtitulo: item ? item.frase({ ...configPadrao(item.campos), ...no.config }, nomes) : "" };
    }
    case "condicao":
      return { titulo: no.rotulo || "Condição", subtitulo: `Se ${fraseDaRegra(def, no.regra, nomes)}` };
    case "caminhos":
      return { titulo: no.rotulo || "Caminhos", subtitulo: `${no.caminhos.length} caminhos + caso contrário` };
    case "espera": {
      const c = no.config;
      return {
        titulo: no.rotulo || "Esperar",
        subtitulo: c.modo === "duracao" ? textoDaDuracao(c.quantidade, c.unidade) : c.modo === "ate_data" ? `até ${c.data || "…"}` : `${c.dias || 0} dia(s) de ${nomes.campo_data?.(c.campo) ?? c.campo ?? "…"}`,
      };
    }
    case "esperar_evento":
      return {
        titulo: no.rotulo || "Esperar evento",
        subtitulo: `${EVENTOS_DE_ESPERA.find((e) => e.tipo === no.evento)?.nome ?? "…"} · até ${textoDaDuracao(no.prazo.quantidade, no.prazo.unidade)}`,
      };
    default:
      return { titulo: "Fim", subtitulo: "Encerra este caminho" };
  }
}

function CanvasInterno({
  def,
  nomes,
  pendencias,
  selecionado,
  selecionar,
  inserir,
  estados,
}: {
  def: Definicao;
  nomes: Nomes;
  pendencias: Pendencia[];
  selecionado: string | null;
  selecionar: (id: string | null) => void;
  inserir: (p: Ponta) => void;
  estados?: Record<string, { estado: EstadoDoNo; ms?: number }>;
}) {
  const { resolved: tema } = useCanvasTheme();
  const rf = useReactFlow();
  const layout = React.useMemo(() => layoutDaAutomacao(def), [def]);
  const contagem = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pendencias) if (p.no && p.nivel === "erro") m.set(p.no, (m.get(p.no) ?? 0) + 1);
    return m;
  }, [pendencias]);

  const nos: Node[] = layout.caixas.map((c) => {
    if (c.tipo === "vazio") return { id: c.id, type: "vazio", position: { x: c.x, y: c.y + (78 - 44) / 2 }, data: { ponta: c.ponta!, inserir }, selectable: false };
    if (c.tipo === "gatilho") {
      const item = def.gatilho ? gatilhoDoTipo(def.gatilho.tipo) : undefined;
      return {
        id: "gatilho",
        type: "passo",
        position: { x: c.x, y: c.y },
        data: {
          tipo: "gatilho",
          titulo: item?.nome ?? "Escolha o gatilho",
          subtitulo: item && def.gatilho ? item.frase({ ...configPadrao(item.campos), ...def.gatilho.config }, nomes) : "O que faz a automação começar",
          pendencias: contagem.get("gatilho") ?? 0,
          selecionado: selecionado === "gatilho",
          ...(estados?.gatilho ?? {}),
        } satisfies DadosDoPasso,
      };
    }
    const no = def.nos[c.noId!];
    const r = resumoDoPasso(def, no, nomes);
    return {
      id: c.id,
      type: "passo",
      position: { x: c.x, y: c.y },
      data: {
        tipo: no.tipo,
        acao: no.tipo === "acao" ? no.acao : undefined,
        ...r,
        pendencias: contagem.get(no.id) ?? 0,
        selecionado: selecionado === no.id,
        ...(estados?.[no.id] ?? {}),
      } satisfies DadosDoPasso,
    };
  });

  const ligacoes: Edge[] = layout.ligacoes.map((l) => ({
    id: l.id,
    source: l.de,
    target: l.para,
    type: "ligacao",
    data: { nome: l.nome, ponta: l.ponta, paraVazio: l.paraVazio, inserir, ativa: !!estados?.[l.para] || (l.de !== "gatilho" && estados?.[l.de]?.estado === "ok" && !!estados?.[l.para]) } satisfies DadosDaLigacao,
  }));

  // Reenquadra quando a árvore muda de tamanho (passo novo, ramo apagado).
  const tamanho = `${layout.caixas.length}:${Math.round(layout.altura)}`;
  React.useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50);
    return () => clearTimeout(t);
  }, [tamanho, rf]);

  return (
    <ReactFlow
      colorMode={tema}
      nodes={nos}
      edges={ligacoes}
      nodeTypes={TIPOS_DE_NO}
      edgeTypes={TIPOS_DE_LIGACAO}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_e, n) => n.type === "passo" && selecionar(n.id)}
      onPaneClick={() => selecionar(null)}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border-default)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable style={{ width: 140, height: 90 }} nodeColor={(n) => (contagem.get(n.id) ? "var(--danger)" : "var(--border-strong)")} />
    </ReactFlow>
  );
}

export function CanvasDaAutomacao(props: React.ComponentProps<typeof CanvasInterno>) {
  return (
    <ReactFlowProvider>
      <CanvasInterno {...props} />
    </ReactFlowProvider>
  );
}
