"use client";

import * as React from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  Plus, Check, CheckCheck, GitBranch, Clock, UserCheck, Square, Sparkles,
  ChevronDown, Search, Phone, Video, MoreVertical, Camera, Mic, Smile,
} from "lucide-react";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { PALETTE_GROUPS } from "./palette-groups";
import { cn } from "@/lib/utils";
import type { FlowNodeData } from "./flow-node";

type Canal = "whatsapp" | "instagram";

/** Um item da conversa montada a partir do fluxo. */
interface Item {
  nodeId: string;
  data: FlowNodeData;
  /** bubble = o cliente vê; system = acontece nos bastidores. */
  forma: "bubble" | "system" | "fork";
  /** Rótulo do ramo pelo qual chegamos aqui (Sim/Não, opção do menu). */
  viaRamo?: string;
}

/** Blocos que o cliente enxerga como mensagem. */
const FALA = new Set<IconKey>(["message", "capture", "agent", "ai-agent"]);
/** Blocos que só existem pendurados num agente de IA, nunca no fio principal. */
const FERRAMENTA = new Set<IconKey>(["tool-http", "tool-knowledge", "tool-mcp", "tool-crm"]);

const CRM_RESUMO: Partial<Record<IconKey, (d: FlowNodeData) => string>> = {
  "crm-deal": (d) => `Cria negócio${d.crmDealName ? ` “${d.crmDealName}”` : ""}${d.crmDealAmount ? ` · ${d.crmDealAmount}` : ""}`,
  "crm-stage": () => "Move o negócio de etapa",
  "crm-task": (d) => `Cria tarefa${d.crmTaskText ? ` “${d.crmTaskText}”` : ""}${d.crmTaskDue ? ` · vence ${d.crmTaskDue}` : ""}`,
  "crm-tag": (d) => (d.crmTagAction === "remove" ? "Tira uma etiqueta" : "Aplica uma etiqueta"),
  "crm-update": (d) => (d.crmUpdateTarget === "contact" ? "Atualiza dados do contato" : "Atualiza dados do negócio"),
  "crm-note": (d) => `Registra nota${d.crmNoteText ? `: “${d.crmNoteText.slice(0, 60)}”` : ""}`,
  "crm-lookup": () => "Consulta o CRM antes de responder",
};

function resumoDeAcao(data: FlowNodeData): string {
  const crm = CRM_RESUMO[data.iconKey];
  if (crm) return crm(data);
  if (data.iconKey === "http") return `${data.httpMethod ?? "POST"} ${data.httpUrl || "(sem URL)"}`;
  if (data.iconKey === "email") return `E-mail para ${data.emailTo || "(sem destinatário)"}`;
  if (data.iconKey === "variable") return `Guarda {${data.variableName || "variavel"}}`;
  if (data.iconKey === "webhook") return `Chama ${data.webhookUrl || "(sem URL)"}`;
  if (data.iconKey === "wait") return `Espera ${data.waitDuration ?? 0} ${data.waitUnit ?? "minutos"}`;
  if (data.iconKey === "human") return "Passa para uma pessoa do time";
  if (data.iconKey === "end") return "Encerra a conversa";
  return data.label;
}

/**
 * Percorre o fluxo do início ao fim seguindo UM caminho, o que a pessoa
 * escolheu nas bifurcações.
 *
 * O canvas mostra o grafo inteiro de uma vez, que é o certo para quem já
 * entendeu o fluxo. Aqui é o contrário: um caminho só, do jeito que o cliente
 * vai viver, porque é assim que se percebe que a terceira pergunta seguida
 * está cansativa ou que o "obrigado" nunca chega.
 */
function montarCaminho(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  escolhas: Record<string, string>
): Item[] {
  const porId = new Map(nodes.map((n) => [n.id, n]));
  const inicio =
    nodes.find((n) => n.data.iconKey === "start") ??
    nodes.find((n) => !edges.some((e) => e.target === n.id && e.targetHandle !== "tools"));
  if (!inicio) return [];

  const itens: Item[] = [];
  const visitados = new Set<string>();
  let atual: Node<FlowNodeData> | undefined = inicio;
  let ramo: string | undefined;

  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    const data = atual.data;

    if (data.iconKey !== "start" && !FERRAMENTA.has(data.iconKey)) {
      itens.push({
        nodeId: atual.id,
        data,
        forma: data.iconKey === "condition" ? "fork" : FALA.has(data.iconKey) ? "bubble" : "system",
        viaRamo: ramo,
      });
      ramo = undefined;
    }

    // Saídas possíveis, ignorando o que está pendurado na porta de ferramentas.
    const saidas = edges.filter((e) => e.source === atual!.id && e.targetHandle !== "tools");
    if (saidas.length === 0) break;

    const escolhida =
      saidas.find((e) => (e.sourceHandle ?? "") === (escolhas[atual!.id] ?? "")) ?? saidas[0];
    if (escolhida.sourceHandle) ramo = escolhida.sourceHandle;
    atual = porId.get(escolhida.target);
  }

  return itens;
}

/** Ferramentas penduradas num bloco de IA, para mostrar embaixo da bolha. */
function ferramentasDe(nodeId: string, nodes: Node<FlowNodeData>[], edges: Edge[]): FlowNodeData[] {
  return edges
    .filter((e) => e.target === nodeId && e.targetHandle === "tools")
    .map((e) => nodes.find((n) => n.id === e.source)?.data)
    .filter((d): d is FlowNodeData => !!d);
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function ConversationMode({
  nodes,
  edges,
  selectedId,
  agentName,
  onSelect,
  onAddAfter,
}: {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedId: string | null;
  agentName: string;
  onSelect: (id: string | null) => void;
  onAddAfter: (afterNodeId: string | null, iconKey: IconKey) => void;
}) {
  const [canal, setCanal] = React.useState<Canal>("whatsapp");
  const [escolhas, setEscolhas] = React.useState<Record<string, string>>({});
  const [abrindoPaleta, setAbrindoPaleta] = React.useState(false);

  const itens = React.useMemo(() => montarCaminho(nodes, edges, escolhas), [nodes, edges, escolhas]);

  // Onde o próximo passo se pendura. Não é simplesmente o último item: se o
  // caminho termina em "Encerrar", o passo novo tem que entrar ANTES dele,
  // senão nasce depois do fim e nunca roda.
  const ancoraId = React.useMemo(() => {
    for (let i = itens.length - 1; i >= 0; i -= 1) {
      if (itens[i].data.iconKey !== "end") return itens[i].nodeId;
    }
    return itens.length > 0 ? itens[0].nodeId : null;
  }, [itens]);

  // Efeitos no CRM ao longo deste caminho: é a resposta para "o que sobra
  // no sistema depois que essa conversa acaba".
  const efeitos = itens.filter((i) => i.data.iconKey.startsWith("crm-"));
  const perguntas = itens.filter((i) => i.data.iconKey === "capture");
  const ia = itens.filter((i) => i.data.iconKey === "ai-agent" || i.data.iconKey === "agent");

  const whats = canal === "whatsapp";

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {/* ── Telefone ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto pb-6">
        <div className="mb-4 flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          {(["whatsapp", "instagram"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCanal(c)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                canal === c ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  c === "whatsapp"
                    ? "bg-emerald-400"
                    : "bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-500"
                )}
              />
              {c === "whatsapp" ? "WhatsApp" : "Instagram"}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "flex w-full max-w-[420px] flex-col overflow-hidden rounded-[32px] border-[10px] border-[#0b0b0d] shadow-2xl",
            whats ? "bg-[#0b141a]" : "bg-black"
          )}
          style={{ minHeight: 560 }}
        >
          {/* Barra do app. Vale a fidelidade: é o que faz alguém sentir o
              tamanho real da mensagem que escreveu. */}
          <header
            className={cn(
              "flex items-center gap-3 px-3.5 py-2.5",
              whats ? "bg-[#1f2c34]" : "border-b border-white/10 bg-black"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white",
                whats ? "bg-[#2a3942]" : "bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-500"
              )}
            >
              {iniciais(agentName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-white">{agentName}</span>
              <span className="block text-[11px] text-white/55">{whats ? "online" : "Ativo agora"}</span>
            </span>
            {whats ? (
              <>
                <Video size={17} className="text-white/60" />
                <Phone size={16} className="text-white/60" />
                <MoreVertical size={16} className="text-white/60" />
              </>
            ) : (
              <>
                <Phone size={16} className="text-white/60" />
                <Video size={17} className="text-white/60" />
              </>
            )}
          </header>

          <div
            className={cn(
              "flex flex-1 flex-col gap-2 px-3 py-4",
              whats && "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><circle cx=%222%22 cy=%222%22 r=%221%22 fill=%22rgba(255,255,255,0.03)%22/></svg>')]"
            )}
          >
            {itens.length === 0 && (
              <p className="m-auto max-w-[240px] text-center text-[12.5px] text-white/40">
                O fluxo está vazio. Adicione o primeiro passo aqui embaixo.
              </p>
            )}

            {itens.map((item) => (
              <ItemDaConversa
                key={item.nodeId}
                item={item}
                canal={canal}
                selecionado={item.nodeId === selectedId}
                ramos={edges
                  .filter((e) => e.source === item.nodeId && e.targetHandle !== "tools")
                  .map((e) => e.sourceHandle ?? "")}
                ramoEscolhido={escolhas[item.nodeId] ?? ""}
                ferramentas={ferramentasDe(item.nodeId, nodes, edges)}
                onSelect={() => onSelect(item.nodeId)}
                onEscolherRamo={(r) => setEscolhas((e) => ({ ...e, [item.nodeId]: r }))}
              />
            ))}
          </div>

          {/* Composer falso: no lugar de digitar, você diz o que vem depois. */}
          <div
            className={cn(
              "relative flex items-center gap-2 px-3 py-2.5",
              whats ? "bg-[#1f2c34]" : "border-t border-white/10 bg-black"
            )}
          >
            {whats && <Smile size={19} className="shrink-0 text-white/45" />}
            <button
              type="button"
              onClick={() => setAbrindoPaleta((v) => !v)}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] transition-colors",
                whats
                  ? "bg-[#2a3942] text-white/60 hover:text-white"
                  : "border border-white/15 text-white/60 hover:text-white"
              )}
            >
              <Plus size={14} /> O que acontece depois
              <ChevronDown size={13} className="ml-auto" />
            </button>
            {whats ? (
              <Mic size={19} className="shrink-0 text-white/45" />
            ) : (
              <Camera size={18} className="shrink-0 text-white/45" />
            )}

            {abrindoPaleta && (
              <PaletaRapida
                onPick={(k) => {
                  onAddAfter(ancoraId, k);
                  setAbrindoPaleta(false);
                }}
                onClose={() => setAbrindoPaleta(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── O que sobra no sistema ───────────────────────────────────── */}
      <aside className="glass-card hidden w-[300px] shrink-0 flex-col gap-5 overflow-y-auto rounded-3xl p-5 xl:flex">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-text-primary">Depois desta conversa</h3>
          <p className="mt-1 text-[12px] text-text-tertiary">
            O que este caminho deixa registrado. Muda conforme você escolhe os ramos.
          </p>
        </div>

        <Secao titulo="No CRM" vazio="Nenhum bloco de CRM neste caminho.">
          {efeitos.map((e) => (
            <Linha
              key={e.nodeId}
              iconKey={e.data.iconKey}
              texto={resumoDeAcao(e.data)}
              ativo={e.nodeId === selectedId}
              onClick={() => onSelect(e.nodeId)}
            />
          ))}
        </Secao>

        <Secao titulo="O que é perguntado" vazio="Este caminho não pergunta nada.">
          {perguntas.map((p) => (
            <Linha
              key={p.nodeId}
              iconKey="capture"
              texto={`${p.data.detail || p.data.label}${p.data.variableName ? ` → {${p.data.variableName}}` : ""}`}
              ativo={p.nodeId === selectedId}
              onClick={() => onSelect(p.nodeId)}
            />
          ))}
        </Secao>

        <Secao titulo="Onde a IA entra" vazio="Nenhum bloco de IA neste caminho.">
          {ia.map((a) => (
            <Linha
              key={a.nodeId}
              iconKey={a.data.iconKey}
              texto={
                a.data.iconKey === "ai-agent"
                  ? `${a.data.aiModel || "modelo padrão"} · ${ferramentasDe(a.nodeId, nodes, edges).length} ferramenta(s)`
                  : "Delega para o agente configurado"
              }
              ativo={a.nodeId === selectedId}
              onClick={() => onSelect(a.nodeId)}
            />
          ))}
        </Secao>

        <p className="mt-auto border-t border-border-subtle pt-3 text-[11.5px] text-text-tertiary">
          {itens.length} passo(s) neste caminho. Clique numa bolha para editar o bloco.
        </p>
      </aside>
    </div>
  );
}

function Secao({
  titulo, vazio, children,
}: {
  titulo: string;
  vazio: string;
  children: React.ReactNode;
}) {
  const temFilhos = React.Children.count(children) > 0;
  return (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{titulo}</p>
      {temFilhos ? <div className="flex flex-col gap-1">{children}</div> : (
        <p className="text-[12px] text-text-tertiary/70">{vazio}</p>
      )}
    </section>
  );
}

function Linha({
  iconKey, texto, ativo, onClick,
}: {
  iconKey: IconKey;
  texto: string;
  ativo: boolean;
  onClick: () => void;
}) {
  const Icone = ICON_REGISTRY[iconKey] ?? Search;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
        ativo ? "bg-accent-soft text-text-primary" : "hover:bg-surface-2"
      )}
    >
      <Icone size={13} className={cn("mt-0.5 shrink-0", ativo ? "text-accent-400" : "text-text-tertiary")} />
      <span className="text-[12px] leading-snug text-text-secondary">{texto}</span>
    </button>
  );
}

function ItemDaConversa({
  item, canal, selecionado, ramos, ramoEscolhido, ferramentas, onSelect, onEscolherRamo,
}: {
  item: Item;
  canal: Canal;
  selecionado: boolean;
  ramos: string[];
  ramoEscolhido: string;
  ferramentas: FlowNodeData[];
  onSelect: () => void;
  onEscolherRamo: (ramo: string) => void;
}) {
  const whats = canal === "whatsapp";
  const { data } = item;

  if (item.forma === "fork") {
    return (
      <div className="my-1 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors",
            selecionado ? "bg-accent-500 text-white" : "bg-white/10 text-white/65 hover:bg-white/15"
          )}
        >
          <GitBranch size={11} className="shrink-0" />
          <span className="truncate">{data.conditionExpression || data.label}</span>
        </button>
        {ramos.length > 1 && (
          <div className="flex gap-1">
            {ramos.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onEscolherRamo(r)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10.5px] font-medium transition-colors",
                  (ramoEscolhido || ramos[0]) === r
                    ? "bg-accent-500/25 text-accent-300 ring-1 ring-accent-500/50"
                    : "bg-white/8 text-white/50 hover:text-white"
                )}
              >
                {r === "true" ? "Sim" : r === "false" ? "Não" : r || "seguir"}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.forma === "system") {
    const Icone = ICON_REGISTRY[data.iconKey] ?? Square;
    const especial =
      data.iconKey === "wait" ? Clock : data.iconKey === "human" ? UserCheck : data.iconKey === "end" ? Square : null;
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "mx-auto my-1 inline-flex max-w-[92%] items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors",
          selecionado ? "bg-accent-500 text-white" : "bg-white/8 text-white/55 hover:bg-white/14 hover:text-white/80"
        )}
      >
        {React.createElement(especial ?? Icone, { size: 11, className: "shrink-0" })}
        <span className="truncate">{resumoDeAcao(data)}</span>
      </button>
    );
  }

  const daIa = data.iconKey === "ai-agent" || data.iconKey === "agent";
  const texto = data.detail || data.label;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-left text-[13px] leading-snug transition-shadow",
          whats
            ? "rounded-bl-md bg-[#202c33] text-white/90"
            : "rounded-bl-md bg-[#262626] text-white/90",
          selecionado && "ring-2 ring-accent-400"
        )}
      >
        {daIa && (
          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-accent-300">
            <Sparkles size={10} /> resposta gerada
          </span>
        )}
        <span className="whitespace-pre-wrap">{texto}</span>

        {data.iconKey === "capture" && (data.options ?? []).length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {(data.options ?? []).map((o) => (
              <span
                key={o.id}
                className="rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] text-white/70"
              >
                {o.label}
              </span>
            ))}
          </span>
        )}

        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/35">
          {data.variableName && <span className="mr-auto font-mono">{`→ {${data.variableName}}`}</span>}
          09:41
          {whats ? <CheckCheck size={11} className="text-sky-400" /> : <Check size={11} />}
        </span>
      </button>

      {ferramentas.length > 0 && (
        <span className="ml-1 flex flex-wrap gap-1">
          {ferramentas.map((f, i) => (
            <span
              key={i}
              className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] text-purple-300"
            >
              {f.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * Paleta curta do composer. Não repete os 20 blocos da paleta do canvas: aqui
 * a pergunta é "o que acontece depois", e a resposta quase sempre é uma
 * dessas. O resto continua a um clique de distância, na aba Editor.
 */
function PaletaRapida({ onPick, onClose }: { onPick: (k: IconKey) => void; onClose: () => void }) {
  const comuns: IconKey[] = ["message", "capture", "condition", "ai-agent", "crm-deal", "crm-task", "human", "end"];
  const rotulos = new Map<IconKey, string>();
  PALETTE_GROUPS.forEach((g) => g.items.forEach((i) => rotulos.set(i.key, i.label)));

  return (
    <>
      <span className="fixed inset-0 z-10" onClick={onClose} />
      <div className="glass-card glass-card-solid absolute bottom-full left-3 right-3 z-20 mb-2 grid grid-cols-2 gap-1 rounded-2xl p-2">
        {comuns.map((k) => {
          const Icone = ICON_REGISTRY[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <Icone size={14} className="shrink-0 text-text-tertiary" />
              {rotulos.get(k) ?? k}
            </button>
          );
        })}
      </div>
    </>
  );
}
