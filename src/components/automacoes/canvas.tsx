"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Panel,
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
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, FlaskConical, Maximize, Minus, Plus, Redo2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { useCanvasTheme } from "@/components/ui/theme";
import { IconButton } from "@/components/ui/icon-button";
import { acaoDoTipo, configPadrao, gatilhoDoTipo, textoDaDuracao, type Nomes } from "@/lib/automacoes/catalogo";
import { fraseDaRegra } from "@/lib/automacoes/frase";
import { layoutDaAutomacao, NO_ALTURA, PASSO_X, VAZIO_ALTURA } from "@/lib/automacoes/layout";
import { EVENTOS_DE_ESPERA } from "@/lib/automacoes/catalogo";
import type { Definicao, No, Ponta } from "@/lib/automacoes/tipos";
import type { Pendencia } from "@/lib/automacoes/validar";
import { IconeDoPasso, visualDoPasso } from "./comum";
import { MOLA } from "@/lib/design-system/movimento";

// ---------------------------------------------------------------------------
// Canvas da automação: layout automático da esquerda para a direita (puro, em
// layout.ts), sem arrastar nem ligar fio à mão. O "+" no meio de cada ligação
// e nos espaços vazios abre o painel "O que vem depois?". `estados` pinta cada
// nó durante uma execução (parte F: ao vivo).
// v6: nó quadrado com ícone grande e rótulo embaixo; fio curvo fino que acende
// (azul do destaque, brilho leve e um pulso correndo) no caminho testado;
// barra flutuante embaixo com Testar, zoom, enquadrar e desfazer/refazer.
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
  /** Atraso da entrada em cascata (s); só na primeira montagem. */
  atraso: number;
}

interface DadosDoVazio extends Record<string, unknown> {
  ponta: Ponta;
  inserir: (p: Ponta) => void;
  ativo: boolean;
  atraso: number;
}

interface DadosDaLigacao extends Record<string, unknown> {
  nome: string;
  ponta: Ponta;
  paraVazio: boolean;
  inserir: (p: Ponta) => void;
  ativa?: boolean;
  inserindoAqui?: boolean;
}

export interface BarraDoCanvas {
  testar: () => void;
  desfazer: () => void;
  refazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
}

// Mola curta e firme (mesma família do resto do app). Só transform/opacity.

// Borda e brilho do quadrado por estado da execução. O brilho é estático
// (box-shadow em repouso não anima); o "rodando" pulsa por opacidade numa camada à parte.
const BORDA_DO_ESTADO: Record<EstadoDoNo, string> = {
  rodando: "border-accent-solid",
  ok: "border-accent-solid shadow-[0_0_0_1px_var(--accent-solid),0_0_22px_-4px_color-mix(in_srgb,var(--accent-solid)_55%,transparent)]",
  falhou: "border-danger shadow-[0_0_0_1px_var(--danger-solid),0_0_20px_-6px_color-mix(in_srgb,var(--danger-solid)_55%,transparent)]",
  pulado: "border-border-subtle opacity-55",
  esperando: "border-warning",
};

// Alça: ponto pequeno no meio da lateral do quadrado (não se liga à mão).
const ALCA = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !rounded-full !border-0 !bg-border-strong";
const ALCA_ACESA = "!bg-accent-solid";

// Pulso do fio e brilho do caminho ativo. Fica num <style> local porque o CSS
// global é de outro dono; nomes com prefixo "fluxo-" para não colidir.
// pathLength=100 no traço: o pulso leva o mesmo tempo em fio curto ou longo.
const CSS_DO_FLUXO = `
@keyframes fluxo-pulso { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -100; } }
.fluxo-eva .fluxo-brilho { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent-solid) 75%, transparent)); }
.fluxo-eva .fluxo-pulso { stroke-dasharray: 9 91; animation: fluxo-pulso 1.8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .fluxo-eva .fluxo-pulso { animation-duration: 5.4s; } }
.fluxo-eva .react-flow__node { cursor: pointer; }
.fluxo-eva .react-flow__node:focus-visible { outline: none; }
.fluxo-eva .react-flow__node:focus-visible .fluxo-quadrado { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
`;

// Luz fraca vinda de cima: o quadrado parece elevado sem sombra em repouso.
const LUZ_DE_CIMA = "linear-gradient(180deg, color-mix(in srgb, var(--text-primary) 6%, transparent), transparent 62%)";

const CartaoDoPasso = React.memo(function CartaoDoPasso({ data }: NodeProps<Node<DadosDoPasso>>) {
  const calmo = useReducedMotion();
  const v = visualDoPasso(data.tipo, data.acao);
  const gatilho = data.tipo === "gatilho";
  const aceso = data.estado === "ok" || data.estado === "rodando";
  const entrada = { ...MOLA, delay: data.atraso };
  return (
    // Caixa fixa de 88×88 (o que o React Flow mede e onde ficam as alças); a
    // escala da entrada/hover vive numa camada de dentro para não mexer nos fios.
    <div className="relative" style={{ width: NO_ALTURA, height: NO_ALTURA }}>
      {!gatilho && <Handle type="target" position={Position.Left} className={cn(ALCA, aceso && ALCA_ACESA)} isConnectable={false} />}
      <motion.div
        initial={calmo ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={calmo ? undefined : { scale: 1.05 }}
        whileTap={calmo ? undefined : { scale: 0.97 }}
        transition={entrada}
        title={`${v.categoria}: ${data.titulo}`}
        style={{ backgroundImage: LUZ_DE_CIMA }}
        className={cn(
          "fluxo-quadrado absolute inset-0 flex items-center justify-center border bg-panel transition-[border-color,box-shadow] duration-200",
          // O gatilho tem a frente redonda: é por onde a automação começa.
          gatilho ? "rounded-[20px] rounded-l-[44px]" : "rounded-[20px]",
          data.estado
            ? BORDA_DO_ESTADO[data.estado]
            : data.selecionado
              ? "border-accent-solid shadow-[0_0_0_1px_var(--accent-solid),0_0_24px_-6px_color-mix(in_srgb,var(--accent-solid)_50%,transparent)]"
              : "border-border-default hover:border-border-strong"
        )}
      >
        {data.estado === "rodando" && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px rounded-[inherit] shadow-[0_0_0_1px_var(--accent-solid),0_0_28px_-2px_color-mix(in_srgb,var(--accent-solid)_60%,transparent)]"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: calmo ? 3.2 : 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <IconeDoPasso visual={v} tamanho={30} strokeWidth={1.6} className={CATEGORY_CLASSES[v.cor].fg} />

        {/* Canto: X se falhou, marcador se falta algo, check discreto se está pronto. */}
        {data.estado === "falhou" ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger-solid text-text-on-danger" title="Falhou no teste">
            <X size={11} aria-hidden="true" />
          </span>
        ) : data.pendencias > 0 ? (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1 text-text-on-danger"
            title={`${data.pendencias} ${data.pendencias === 1 ? "pendência" : "pendências"}`}
          >
            <AlertCircle size={11} aria-hidden="true" />
          </span>
        ) : data.tipo !== "fim" ? (
          <Check
            size={12}
            strokeWidth={2.4}
            aria-label="Configurado"
            className={cn("absolute right-2 top-2", data.estado === "ok" ? "text-accent-fg" : "text-text-tertiary opacity-70")}
          />
        ) : null}

        {data.ms !== undefined && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border-subtle bg-raised px-1.5 font-mono text-caption leading-4 text-text-secondary">
            {data.ms} ms
          </span>
        )}
      </motion.div>

      {/* Nome e resumo embaixo do quadrado, fora da caixa medida (o layout
          deixa o vão). pointer-events none: o clique é no nó. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: data.atraso + 0.08 }}
        className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] flex w-[176px] -translate-x-1/2 flex-col items-center gap-0.5 text-center"
      >
        <p className={cn("max-w-full truncate text-small font-medium leading-tight", data.selecionado ? "text-accent-fg" : "text-text-primary")}>{data.titulo}</p>
        <p className="max-w-full truncate text-caption leading-tight text-text-tertiary">{data.subtitulo}</p>
      </motion.div>

      {data.tipo !== "fim" && <Handle type="source" position={Position.Right} className={cn(ALCA, aceso && ALCA_ACESA)} isConnectable={false} />}
    </div>
  );
});

const EspacoVazio = React.memo(function EspacoVazio({ data }: NodeProps<Node<DadosDoVazio>>) {
  const calmo = useReducedMotion();
  return (
    <div className="relative" style={{ width: VAZIO_ALTURA, height: VAZIO_ALTURA }}>
      <Handle type="target" position={Position.Left} className="!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <motion.button
        type="button"
        aria-label="Adicionar o próximo passo"
        onClick={(e) => {
          e.stopPropagation();
          data.inserir(data.ponta);
        }}
        initial={calmo ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={calmo ? undefined : { scale: 1.08 }}
        whileTap={calmo ? undefined : { scale: 0.94 }}
        transition={{ ...MOLA, delay: data.atraso }}
        className={cn(
          "nodrag absolute inset-0 flex items-center justify-center rounded-[16px] border border-dashed transition-colors duration-150",
          data.ativo
            ? "border-solid border-accent-solid bg-accent-subtle text-accent-fg"
            : "border-border-strong text-text-tertiary hover:border-accent-solid hover:text-accent-fg"
        )}
      >
        <Plus size={18} aria-hidden="true" />
      </motion.button>
      <p className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] -translate-x-1/2 whitespace-nowrap font-mono text-caption text-text-tertiary">
        próximo passo
      </p>
    </div>
  );
});

// Fio fino e curvo. No caminho testado, um traço por cima acende no azul do
// destaque com brilho leve e outro, tracejado, faz o pulso correr pelo fio.
// (O traço base tem cor fixa no CSS global, por isso o aceso é outro <path>.)
function Ligacao({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<DadosDaLigacao>>) {
  const [caminho, x, y] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const ativa = !!data?.ativa;
  return (
    <>
      <BaseEdge id={id} path={caminho} />
      {ativa && (
        <>
          <path d={caminho} fill="none" stroke="var(--accent-solid)" strokeWidth={1.75} strokeLinecap="round" className="fluxo-brilho pointer-events-none" />
          <path
            d={caminho}
            fill="none"
            pathLength={100}
            stroke="var(--accent-fg)"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="fluxo-pulso fluxo-brilho pointer-events-none"
          />
        </>
      )}
      <EdgeLabelRenderer>
        <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
          {data?.nome && (
            <span
              className={cn(
                "rounded-full bg-page px-1.5 font-mono text-caption leading-5",
                ativa ? "text-accent-fg" : "text-text-tertiary"
              )}
            >
              {data.nome}
            </span>
          )}
          {data && !data.paraVazio && (
            <button
              type="button"
              aria-label="Inserir passo aqui"
              onClick={(e) => {
                e.stopPropagation();
                data.inserir(data.ponta);
              }}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border transition-[background-color,border-color,color,opacity,transform] duration-150 hover:scale-110 active:scale-[0.96] motion-reduce:hover:scale-100",
                data.inserindoAqui
                  ? "border-accent-solid bg-accent-solid text-text-on-accent opacity-100"
                  : "border-border-default bg-panel text-text-tertiary opacity-70 hover:border-accent-solid hover:bg-accent-solid hover:text-text-on-accent hover:opacity-100"
              )}
            >
              <Plus size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const TIPOS_DE_NO = { passo: CartaoDoPasso, vazio: EspacoVazio };
const TIPOS_DE_LIGACAO = { ligacao: Ligacao };

// Cores do React Flow pelas variáveis dele (sem mexer no CSS global): quadro
// transparente sobre o fundo do contêiner, minimapa nos tokens.
const ESTILO_DO_QUADRO = {
  "--xy-background-color": "transparent",
  "--xy-minimap-background-color": "var(--surface-panel)",
  // Máscara leve: o que está fora da vista só esmaece (antes virava uma moldura cinza grossa).
  "--xy-minimap-mask-background-color": "color-mix(in srgb, var(--text-primary) 5%, transparent)",
  "--xy-minimap-mask-stroke-color": "var(--border-strong)",
  "--xy-minimap-mask-stroke-width": "1",
  "--xy-edge-label-background-color": "var(--surface-page)",
} as React.CSSProperties;

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

const mesmaPonta = (a: Ponta | null | undefined, b: Ponta) => !!a && a.de === b.de && a.saida === b.saida;

// Barra flutuante embaixo, no centro: as ações que já existiam (Testar,
// zoom, enquadrar, desfazer/refazer) numa cápsula só.
function BarraFlutuante({ barra }: { barra: BarraDoCanvas }) {
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
        <button
          type="button"
          onClick={barra.testar}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-inverse px-3.5 text-small font-medium text-inverse-fg transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100"
        >
          <FlaskConical size={14} aria-hidden="true" /> Testar
        </button>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border-default" />
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
        <IconButton aria-label="Desfazer (Ctrl+Z)" tooltip disabled={!barra.podeDesfazer} onClick={barra.desfazer}>
          <Undo2 />
        </IconButton>
        <IconButton aria-label="Refazer (Ctrl+Shift+Z)" tooltip disabled={!barra.podeRefazer} onClick={barra.refazer}>
          <Redo2 />
        </IconButton>
      </motion.div>
    </Panel>
  );
}

function CanvasInterno({
  def,
  nomes,
  pendencias,
  selecionado,
  selecionar,
  inserir,
  inserindo,
  estados,
  barra,
}: {
  def: Definicao;
  nomes: Nomes;
  pendencias: Pendencia[];
  selecionado: string | null;
  selecionar: (id: string | null) => void;
  inserir: (p: Ponta) => void;
  /** Ponta onde o painel "O que vem depois?" vai colocar o passo (acende o "+"). */
  inserindo?: Ponta | null;
  estados?: Record<string, { estado: EstadoDoNo; ms?: number }>;
  barra: BarraDoCanvas;
}) {
  const { resolved: tema } = useCanvasTheme();
  const rf = useReactFlow();
  const layout = React.useMemo(() => layoutDaAutomacao(def), [def]);
  const contagem = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pendencias) if (p.no && p.nivel === "erro") m.set(p.no, (m.get(p.no) ?? 0) + 1);
    return m;
  }, [pendencias]);

  // Cascata só na abertura: passo novo depois entra na hora, sem esperar a coluna.
  const [abrindo, setAbrindo] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setAbrindo(false), 900);
    return () => clearTimeout(t);
  }, []);
  const atrasoDe = (x: number) => (abrindo ? Math.min(Math.round(x / PASSO_X), 8) * 0.07 : 0);

  const nos: Node[] = layout.caixas.map((c) => {
    if (c.tipo === "vazio")
      return {
        id: c.id,
        type: "vazio",
        position: { x: c.x, y: c.y },
        // Tamanho declarado: o nó fica visível sem depender da medição do
        // ResizeObserver (que se perde a cada render, porque os nós são recriados).
        width: VAZIO_ALTURA,
        height: VAZIO_ALTURA,
        data: { ponta: c.ponta!, inserir, ativo: mesmaPonta(inserindo, c.ponta!), atraso: atrasoDe(c.x) } satisfies DadosDoVazio,
        selectable: false,
      };
    if (c.tipo === "gatilho") {
      const item = def.gatilho ? gatilhoDoTipo(def.gatilho.tipo) : undefined;
      return {
        id: "gatilho",
        type: "passo",
        position: { x: c.x, y: c.y },
        width: NO_ALTURA,
        height: NO_ALTURA,
        data: {
          tipo: "gatilho",
          titulo: item?.nome ?? "Escolha o gatilho",
          subtitulo: item && def.gatilho ? item.frase({ ...configPadrao(item.campos), ...def.gatilho.config }, nomes) : "O que faz a automação começar",
          pendencias: contagem.get("gatilho") ?? 0,
          selecionado: selecionado === "gatilho",
          atraso: 0,
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
      width: NO_ALTURA,
      height: NO_ALTURA,
      data: {
        tipo: no.tipo,
        acao: no.tipo === "acao" ? no.acao : undefined,
        ...r,
        pendencias: contagem.get(no.id) ?? 0,
        selecionado: selecionado === no.id,
        atraso: atrasoDe(c.x),
        ...(estados?.[no.id] ?? {}),
      } satisfies DadosDoPasso,
    };
  });

  const ligacoes: Edge[] = layout.ligacoes.map((l) => ({
    id: l.id,
    source: l.de,
    target: l.para,
    type: "ligacao",
    data: {
      nome: l.nome,
      ponta: l.ponta,
      paraVazio: l.paraVazio,
      inserir,
      inserindoAqui: !l.paraVazio && mesmaPonta(inserindo, l.ponta),
      ativa: !!estados?.[l.para] || (l.de !== "gatilho" && estados?.[l.de]?.estado === "ok" && !!estados?.[l.para]),
    } satisfies DadosDaLigacao,
  }));

  // Reenquadra quando a árvore muda de tamanho (passo novo, ramo apagado).
  const tamanho = `${layout.caixas.length}:${Math.round(layout.altura)}`;
  React.useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50);
    return () => clearTimeout(t);
  }, [tamanho, rf]);

  // data-theme no contêiner: "canvas sempre escuro" vale também para os
  // cartões (tokens), não só para o fundo do React Flow.
  return (
    <div data-theme={tema} className="fluxo-eva h-full w-full bg-page text-text-primary">
      <style>{CSS_DO_FLUXO}</style>
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
        style={ESTILO_DO_QUADRO}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="var(--border-default)" />
        <BarraFlutuante barra={barra} />
        <MiniMap
          pannable
          zoomable
          className="!overflow-hidden !rounded-[14px] !border !border-border-subtle"
          style={{ width: 132, height: 84 }}
          nodeBorderRadius={14}
          nodeColor={(n) => (contagem.get(n.id) ? "var(--danger-solid)" : "var(--border-strong)")}
        />
      </ReactFlow>
    </div>
  );
}

export function CanvasDaAutomacao(props: React.ComponentProps<typeof CanvasInterno>) {
  return (
    <ReactFlowProvider>
      <CanvasInterno {...props} />
    </ReactFlowProvider>
  );
}
