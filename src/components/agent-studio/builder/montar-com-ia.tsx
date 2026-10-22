"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import type { Node, Edge } from "@xyflow/react";
import { Loader2, AlertTriangle, Undo2, X, ArrowRight, RotateCcw } from "lucide-react";
import { MarcaEva } from "@/components/layout/marca-eva";
import { pulsar } from "@/lib/fundo/eventos";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FlowNodeData } from "./flow-node";
import { ICON_REGISTRY } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";
import { acrescentarAoFluxo } from "./ia-aplicar";

// ---------------------------------------------------------------------------
// "Montar com IA" no construtor: a pessoa descreve o fluxo, a IA devolve um
// rascunho validado no servidor, a prévia mostra os blocos em linguagem de
// gente e só "Aplicar no canvas" mexe no fluxo. Depois de aplicar, dá para
// desfazer (volta exatamente o canvas de antes).
// ---------------------------------------------------------------------------

type Grafo = { nodes: Node<FlowNodeData>[]; edges: Edge[] };

interface Rascunho {
  fluxo: Grafo;
  explicacao: string;
  avisos: string[];
}

const EXEMPLOS = [
  "Fluxo que recebe o lead do Instagram, pergunta nome e WhatsApp, pergunta o segmento e cria um negócio no funil B2B na etapa Novo lead.",
  "Dá boas-vindas, pergunta se é cliente ou não; cliente vai para um atendente, quem não é deixa o e-mail e recebe a etiqueta Lead frio.",
  "Pergunta o orçamento; acima de 5000 cria uma tarefa de ligar amanhã para o time comercial, senão agradece e encerra.",
];

interface Nomes {
  etapas: Map<string, string>;
  funis: Map<string, string>;
  etiquetas: Map<string, string>;
}

function descrever(d: FlowNodeData, nomes: Nomes): string {
  switch (d.iconKey) {
    case "start":
      return "A conversa começa aqui.";
    case "message":
      return `Diz: “${d.detail ?? ""}”`;
    case "capture": {
      if (d.options?.length) return `Pergunta “${d.detail ?? ""}” com as opções ${d.options.map((o) => o.label).join(", ")}.`;
      const tipo =
        d.captureField === "name" ? "o nome" :
        d.captureField === "email" ? "o e-mail (com validação)" :
        d.captureField === "phone" ? "o telefone (com validação)" :
        d.captureField === "custom" ? `o campo ${d.captureCustomKey}` :
        `a resposta em {${d.variableName}}`;
      return `Pergunta “${d.detail ?? ""}” e guarda ${tipo}.`;
    }
    case "condition":
      return `Confere ${d.conditionExpression || "(condição em branco)"}.`;
    case "variable":
      return `Guarda {${d.variableName}}${d.variableExpression ? ` = ${d.variableExpression}` : ""}.`;
    case "wait":
      return `Espera ${d.waitDuration} ${d.waitUnit ?? "minutos"}.`;
    case "human":
      return "Passa a conversa para um atendente.";
    case "end":
      return d.detail ? `Encerra dizendo “${d.detail}”.` : "Encerra a conversa.";
    case "crm-deal": {
      const funil = d.crmPipelineId ? nomes.funis.get(d.crmPipelineId) : null;
      const etapa = d.crmStageId ? nomes.etapas.get(d.crmStageId) : null;
      return `Cria o negócio “${d.crmDealName ?? ""}”${funil ? ` no funil ${funil}` : " no funil padrão"}${etapa ? `, etapa ${etapa}` : ""}.`;
    }
    case "crm-stage":
      return `Move o negócio para ${d.crmStageId ? nomes.etapas.get(d.crmStageId) ?? "a etapa escolhida" : "(etapa a escolher)"}.`;
    case "crm-task":
      return `Cria a tarefa “${d.crmTaskText ?? ""}”${d.crmTaskDue ? ` para ${d.crmTaskDue}` : ""}.`;
    case "crm-tag": {
      const tag = d.crmTagId ? nomes.etiquetas.get(d.crmTagId) ?? "a etiqueta escolhida" : "(etiqueta a escolher)";
      return d.crmTagAction === "remove" ? `Tira a etiqueta ${tag}.` : `Aplica a etiqueta ${tag}.`;
    }
    case "crm-update":
      return `Grava as respostas nos campos do ${d.crmUpdateTarget === "contact" ? "contato" : "negócio"}.`;
    case "crm-note":
      return `Registra a nota “${d.crmNoteText ?? ""}”.`;
    case "crm-lookup":
      return "Consulta o CRM do contato para decidir o caminho.";
    default:
      return d.detail ?? "";
  }
}

/** Ordem de leitura: a partir do Início, seguindo as ligações. */
function emOrdem(g: Grafo): Node<FlowNodeData>[] {
  const inicio = g.nodes.find((n) => n.data.iconKey === "start") ?? g.nodes[0];
  if (!inicio) return [];
  const vistos = new Set([inicio.id]);
  const fila = [inicio.id];
  const ordem: Node<FlowNodeData>[] = [];
  while (fila.length) {
    const id = fila.shift()!;
    const no = g.nodes.find((n) => n.id === id);
    if (no) ordem.push(no);
    for (const e of g.edges) if (e.source === id && !vistos.has(e.target)) { vistos.add(e.target); fila.push(e.target); }
  }
  return ordem;
}

function rotuloDaSaida(origem: FlowNodeData, handle: string | null | undefined): string | null {
  if (origem.iconKey === "condition") return handle === "false" ? "Não" : "Sim";
  if (origem.options?.length) return origem.options.find((o) => o.id === handle)?.label ?? null;
  if (handle === "invalido") return "Não respondeu certo";
  return null;
}

export function MontarComIa({
  agentId,
  nodes,
  edges,
  onAplicar,
}: {
  agentId: string;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  onAplicar: (nodes: Node<FlowNodeData>[], edges: Edge[]) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [pedido, setPedido] = React.useState("");
  const [ajuste, setAjuste] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<{ msg: string; semChave: boolean } | null>(null);
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [anterior, setAnterior] = React.useState<{ grafo: Grafo; aviso: string | null } | null>(null);
  const [nomes, setNomes] = React.useState<Nomes>({ etapas: new Map(), funis: new Map(), etiquetas: new Map() });

  // Nomes de funil/etapa/etiqueta só para a prévia ficar legível.
  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    Promise.all([
      fetch("/api/pipelines").then((r) => r.json()).catch(() => ({})),
      fetch("/api/tags").then((r) => r.json()).catch(() => ({})),
    ]).then(([p, t]) => {
      if (!vivo) return;
      const pipelines = (p.pipelines ?? []) as { id: string; name: string; stages: { id: string; name: string }[] }[];
      setNomes({
        funis: new Map(pipelines.map((x) => [x.id, x.name])),
        etapas: new Map(pipelines.flatMap((x) => x.stages.map((s) => [s.id, `${s.name} (${x.name})`] as [string, string]))),
        etiquetas: new Map(((t.tags ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])),
      });
    });
    return () => { vivo = false; };
  }, [aberto]);

  async function gerar(texto: string, atual?: Grafo) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/flow/ia/rascunho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido: texto, ...(atual ? { atual } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro({ msg: data.error ?? "Não deu para montar o rascunho agora.", semChave: data.codigo === "sem_chave" });
        return;
      }
      setRascunho({ fluxo: data.fluxo, explicacao: data.explicacao ?? "", avisos: data.avisos ?? [] });
      setAjuste("");
    } catch {
      setErro({ msg: "Sem conexão com o servidor. Tenta de novo.", semChave: false });
    } finally {
      setCarregando(false);
    }
  }

  function aplicar(modo: "substituir" | "acrescentar") {
    if (!rascunho) return;
    const antes: Grafo = { nodes, edges };
    let aviso: string | null = null;
    if (modo === "substituir") {
      onAplicar(rascunho.fluxo.nodes, rascunho.fluxo.edges);
    } else {
      const r = acrescentarAoFluxo(antes, rascunho.fluxo);
      if (!r.ligado) aviso = "Não achei a ponta do fluxo para ligar o rascunho: ele entrou logo abaixo, ligue à mão.";
      onAplicar(r.nodes, r.edges);
    }
    setAnterior({ grafo: antes, aviso });
    // O canvas mudou de uma vez: uma onda no fundo diz que algo aconteceu.
    pulsar(null, 1.6);
    setAberto(false);
    setRascunho(null);
    setPedido("");
  }

  function desfazer() {
    if (!anterior) return;
    onAplicar(anterior.grafo.nodes, anterior.grafo.edges);
    setAnterior(null);
  }

  const ordem = rascunho ? emOrdem(rascunho.fluxo) : [];
  const temFluxo = nodes.some((n) => n.data.iconKey !== "start");

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Descreva o fluxo e a Eva monta um rascunho"
        aria-label="Montar com IA"
        className={buttonVariants({ variant: "secondary", size: "md" })}
      >
        {/* IA marcada pelo símbolo da Eva, não por brilho nem violeta. */}
        <MarcaEva size={14} /> <span className="hidden sm:inline">Montar com IA</span>
      </button>

      {anterior && (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-[22px] border border-border-subtle bg-overlay/90 px-4 py-3 shadow-overlay backdrop-blur-xl">
          <MarcaEva size={15} className="shrink-0 text-text-secondary" />
          <span className="text-small text-text-primary">
            Rascunho da IA no canvas. O construtor salva sozinho, como em qualquer edição: revise os blocos ou desfaça para voltar ao fluxo de antes.
            {anterior.aviso && <span className="block text-caption text-warning">{anterior.aviso}</span>}
          </span>
          <Button variant="secondary" size="sm" onClick={desfazer}>
            <Undo2 size={14} aria-hidden="true" /> Desfazer
          </Button>
          <button
            type="button"
            onClick={() => setAnterior(null)}
            className="rounded-lg p-1 text-text-tertiary hover:text-text-primary"
            aria-label="Fechar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Modal open={aberto} onOpenChange={(o) => !carregando && setAberto(o)}>
        <ModalContent
          className="max-w-2xl"
          title="Montar fluxo com IA"
          description="Conta com suas palavras como a conversa deve andar. A IA monta um rascunho e nada muda no canvas até você aplicar."
        >
          <div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto pr-1">
            {!rascunho ? (
              <>
                <div>
                  <Label htmlFor="ia-fluxo-pedido">Me conta o que esse fluxo deve fazer</Label>
                  <Textarea
                    id="ia-fluxo-pedido"
                    rows={4}
                    maxLength={800}
                    value={pedido}
                    onChange={(e) => setPedido(e.target.value)}
                    placeholder="Ex.: recebe o lead, pergunta nome e WhatsApp e cria um negócio no funil de vendas."
                  />
                  <p className="mt-1 text-right text-caption text-text-tertiary">{pedido.length}/800</p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-caption text-text-tertiary">Ou comece por um exemplo:</span>
                  {EXEMPLOS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setPedido(ex)}
                      className="rounded-[14px] border border-border-subtle bg-raised px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {rascunho.explicacao && (
                  <div className="flex gap-2 rounded-[14px] bg-raised px-4 py-3 text-small text-text-primary">
                    <MarcaEva size={13} className="mt-0.5 shrink-0 text-text-secondary" />
                    {rascunho.explicacao}
                  </div>
                )}

                <ol className="flex flex-col gap-2">
                  {ordem.map((n, i) => {
                    const Icon = ICON_REGISTRY[n.data.iconKey] ?? ICON_REGISTRY.message;
                    const style = BLOCK_STYLES[n.data.iconKey] ?? BLOCK_STYLES.message;
                    const saidas = rascunho.fluxo.edges.filter((e) => e.source === n.id);
                    const ramifica = saidas.length > 1 || saidas.some((e) => e.sourceHandle);
                    return (
                      <li key={n.id} className="flex gap-3 rounded-[14px] bg-raised px-3.5 py-2.5">
                        <span className="w-4 pt-1.5 text-right font-mono text-caption tabular-nums text-text-tertiary">{i + 1}</span>
                        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", style.badgeBg, style.badgeText)}>
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-small font-medium text-text-primary">{n.data.label}</p>
                          <p className="text-small text-text-secondary">{descrever(n.data, nomes)}</p>
                          {ramifica && (
                            <ul className="mt-1 flex flex-col gap-0.5">
                              {saidas.map((e) => (
                                <li key={e.id} className="flex items-center gap-1.5 text-caption text-text-tertiary">
                                  <ArrowRight size={11} />
                                  {rotuloDaSaida(n.data, e.sourceHandle) ?? "Segue"}:{" "}
                                  {rascunho.fluxo.nodes.find((x) => x.id === e.target)?.data.label}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {rascunho.avisos.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-[14px] bg-warning-subtle px-4 py-3">
                    <span className="flex items-center gap-1.5 text-small font-medium text-warning">
                      <AlertTriangle size={13} /> Vale conferir
                    </span>
                    {rascunho.avisos.map((a) => (
                      <p key={a} className="text-small text-text-secondary">{a}</p>
                    ))}
                  </div>
                )}

                <div>
                  <Label htmlFor="ia-fluxo-ajuste">Quer mudar alguma coisa?</Label>
                  <div className="flex gap-2">
                    <Textarea
                      id="ia-fluxo-ajuste"
                      rows={2}
                      maxLength={800}
                      value={ajuste}
                      onChange={(e) => setAjuste(e.target.value)}
                      placeholder="Ex.: pergunta também o e-mail antes de criar o negócio."
                    />
                    <Button
                      variant="secondary"
                      className="self-end"
                      disabled={carregando || ajuste.trim().length < 5}
                      onClick={() => gerar(ajuste.trim(), rascunho.fluxo)}
                    >
                      {carregando ? <Loader2 size={15} className="animate-spin" /> : <MarcaEva size={14} />} Ajustar
                    </Button>
                  </div>
                </div>
              </>
            )}

            {erro && (
              <div className="rounded-[14px] bg-danger-subtle px-4 py-3 text-small text-danger">
                {erro.msg}
                {erro.semChave && (
                  <Link href="/integracoes" className="ml-1 font-medium underline">
                    Abrir Integrações
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
            {!rascunho ? (
              <>
                <Button variant="ghost" onClick={() => setAberto(false)} disabled={carregando}>Cancelar</Button>
                <Button onClick={() => gerar(pedido.trim())} disabled={carregando || pedido.trim().length < 5}>
                  {carregando ? <Loader2 size={15} className="animate-spin" /> : <MarcaEva size={14} />}
                  {carregando ? "Montando o rascunho…" : "Montar rascunho"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className="mr-auto" onClick={() => setRascunho(null)} disabled={carregando}>
                  <RotateCcw size={14} /> Começar de novo
                </Button>
                {temFluxo && (
                  <Button variant="secondary" onClick={() => aplicar("acrescentar")} disabled={carregando}>
                    Acrescentar ao final
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (temFluxo && !confirm("Substituir o fluxo atual pelo rascunho? Dá para desfazer logo depois.")) return;
                    aplicar("substituir");
                  }}
                  disabled={carregando}
                >
                  {temFluxo ? "Substituir fluxo atual" : "Aplicar no canvas"}
                </Button>
              </>
            )}
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
