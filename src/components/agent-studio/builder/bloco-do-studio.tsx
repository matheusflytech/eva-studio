"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateId } from "@/lib/utils";
import type { BlockAction, BlockCondition, BlockContent, FlowNodeData } from "./flow-node";
import { getBlockDefault } from "./block-defaults";
import { PALETTE_GROUPS } from "./palette-groups";
import { IconeDoBloco } from "./icone-do-bloco";
import { CaptureConfig } from "./capture-config";
import type { IconKey } from "./icon-registry";

// ---------------------------------------------------------------------------
// Painel do Bloco do Studio. Ordem no motor (flow-engine.ts): ações de entrada
// → conteúdo → espera a resposta → ações de saída → saída. As ações guardam
// os mesmos dados dos blocos de ação e são editadas pelo mesmo inspetor.
// ---------------------------------------------------------------------------

export type AbaDoBloco = "conteudo" | "saidas" | "acoes";

const ACOES: IconKey[] = [
  "variable",
  "http",
  "email",
  "crm-deal",
  "crm-stage",
  "crm-task",
  "crm-tag",
  "crm-update",
  "crm-note",
  "crm-lookup",
];
const ROTULO = new Map(PALETTE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])));

/** Desenha o inspetor de uma ação (o NodeInspector, vindo de fora para não haver import circular). */
export type InspetorDeAcao = (props: {
  node: Node<FlowNodeData>;
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) => React.ReactNode;

function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export function PainelDoBloco({
  data,
  aba,
  onChange,
  inspetorDaAcao,
}: {
  data: FlowNodeData;
  aba: AbaDoBloco;
  onChange: (patch: Partial<FlowNodeData>) => void;
  inspetorDaAcao: InspetorDeAcao;
}) {
  // Ação aberta: qual lista e qual id. O inspetor dela cobre o painel.
  const [aberta, setAberta] = React.useState<{ lista: "entryActions" | "exitActions"; id: string } | null>(null);
  const acao = aberta ? (data[aberta.lista] ?? []).find((a) => a.id === aberta.id) : undefined;

  if (aba === "acoes" && aberta && acao) {
    const lista = aberta.lista;
    const trocar = (fn: (atuais: BlockAction[]) => BlockAction[]) => onChange({ [lista]: fn(data[lista] ?? []) });
    return inspetorDaAcao({
        node: { id: acao.id, position: { x: 0, y: 0 }, data: acao.data },
        onChange: (patch) => trocar((atuais) => atuais.map((a) => (a.id === acao.id ? { ...a, data: { ...a.data, ...patch } } : a))),
        onDelete: () => {
          trocar((atuais) => atuais.filter((a) => a.id !== acao.id));
          setAberta(null);
        },
        onClose: () => setAberta(null),
    });
  }

  if (aba === "saidas") return <CondicoesDoBloco data={data} onChange={onChange} />;
  if (aba === "acoes") {
    return (
      <div className="flex flex-col gap-5">
        <ListaDeAcoes
          titulo="Ao entrar no bloco"
          ajuda="Antes de mandar o conteúdo."
          acoes={data.entryActions ?? []}
          onChange={(entryActions) => onChange({ entryActions })}
          abrir={(id) => setAberta({ lista: "entryActions", id })}
        />
        <ListaDeAcoes
          titulo="Ao sair do bloco"
          ajuda={data.waitForReply ? "Depois da resposta, antes de escolher a saída." : "Depois do conteúdo, antes de escolher a saída."}
          acoes={data.exitActions ?? []}
          onChange={(exitActions) => onChange({ exitActions })}
          abrir={(id) => setAberta({ lista: "exitActions", id })}
        />
      </div>
    );
  }
  return <ConteudoDoBloco data={data} onChange={onChange} />;
}

function ConteudoDoBloco({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const itens = data.blockContents ?? [];
  const mudar = (i: number, parte: Partial<BlockContent>) =>
    onChange({ blockContents: itens.map((c, j) => (j === i ? { ...c, ...parte } : c)) });
  const adicionar = (type: BlockContent["type"]) =>
    onChange({ blockContents: [...itens, type === "text" ? { id: generateId(), type, text: "" } : { id: generateId(), type, seconds: 2 }] });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">Mandado na ordem da lista. Use {"{variavel}"} para personalizar.</p>
      {itens.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-[14px] border border-border-subtle bg-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
              {c.type === "text" ? "Texto" : "Digitando…"}
            </span>
            <span className="flex items-center">
              <BotaoPequeno rotulo="Subir" onClick={() => onChange({ blockContents: mover(itens, i, -1) })} disabled={i === 0}>
                <ArrowUp size={13} />
              </BotaoPequeno>
              <BotaoPequeno rotulo="Descer" onClick={() => onChange({ blockContents: mover(itens, i, 1) })} disabled={i === itens.length - 1}>
                <ArrowDown size={13} />
              </BotaoPequeno>
              <BotaoPequeno rotulo="Remover" perigo onClick={() => onChange({ blockContents: itens.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </BotaoPequeno>
            </span>
          </div>
          {c.type === "text" ? (
            <Textarea
              aria-label={`Texto ${i + 1}`}
              rows={3}
              value={c.text ?? ""}
              onChange={(e) => mudar(i, { text: e.target.value })}
            />
          ) : (
            <label className="flex items-center gap-2 text-small text-text-secondary">
              Por
              <Input
                type="number"
                min={1}
                max={10}
                className="w-20"
                value={c.seconds ?? 2}
                onChange={(e) => mudar(i, { seconds: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
              />
              segundos, antes da próxima mensagem (WhatsApp).
            </label>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <BotaoAdicionar onClick={() => adicionar("text")}>Texto</BotaoAdicionar>
        <BotaoAdicionar onClick={() => adicionar("typing")}>Digitando…</BotaoAdicionar>
      </div>

      <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
          <span>
            <span className="block text-small font-medium text-text-primary">Esperar resposta do cliente</span>
            <span className="block text-caption text-text-tertiary">
              {data.waitForReply ? "O último texto vira a pergunta; os botões vão junto com ele." : "O bloco manda o conteúdo e segue."}
            </span>
          </span>
          <Switch checked={!!data.waitForReply} onCheckedChange={(v) => onChange({ waitForReply: v })} aria-label="Esperar resposta do cliente" />
        </label>
        {data.waitForReply && <CaptureConfig data={data} onChange={onChange} />}
      </section>
    </div>
  );
}

function CondicoesDoBloco({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const lista = data.exitConditions ?? [];
  const mudar = (i: number, parte: Partial<BlockCondition>) =>
    onChange({ exitConditions: lista.map((c, j) => (j === i ? { ...c, ...parte } : c)) });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">
        Vale a primeira condição verdadeira, de cima para baixo. Sem nenhuma, segue pelo botão escolhido (ou pela saída
        normal). Cada condição vira uma porta no card: ligue ao bloco de destino.
      </p>
      {lista.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-[14px] border border-border-subtle bg-raised p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`cond-nome-${c.id}`}>Nome da saída</Label>
              <Input id={`cond-nome-${c.id}`} placeholder="ex: Cliente VIP" value={c.label} onChange={(e) => mudar(i, { label: e.target.value })} />
            </div>
            <BotaoPequeno rotulo="Subir" onClick={() => onChange({ exitConditions: mover(lista, i, -1) })} disabled={i === 0}>
              <ArrowUp size={13} />
            </BotaoPequeno>
            <BotaoPequeno rotulo="Remover" perigo onClick={() => onChange({ exitConditions: lista.filter((_, j) => j !== i) })}>
              <Trash2 size={13} />
            </BotaoPequeno>
          </div>
          <div>
            <Label htmlFor={`cond-expr-${c.id}`}>Condição</Label>
            <Input
              id={`cond-expr-${c.id}`}
              className="font-mono text-small"
              placeholder='ex: {plano} == "pro"'
              value={c.expression}
              onChange={(e) => mudar(i, { expression: e.target.value })}
            />
          </div>
        </div>
      ))}
      <BotaoAdicionar onClick={() => onChange({ exitConditions: [...lista, { id: generateId(), label: "", expression: "" }] })}>
        Adicionar condição
      </BotaoAdicionar>
    </div>
  );
}

function ListaDeAcoes({
  titulo,
  ajuda,
  acoes,
  onChange,
  abrir,
}: {
  titulo: string;
  ajuda: string;
  acoes: BlockAction[];
  onChange: (acoes: BlockAction[]) => void;
  abrir: (id: string) => void;
}) {
  function adicionar(iconKey: IconKey) {
    const id = generateId();
    const padrao = getBlockDefault(iconKey)?.data ?? {};
    onChange([...acoes, { id, data: { label: ROTULO.get(iconKey) ?? iconKey, ...padrao, iconKey } as FlowNodeData }]);
    abrir(id);
  }
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{titulo}</h3>
        <p className="text-caption text-text-tertiary">{ajuda}</p>
      </div>
      {acoes.map((a, i) => (
        <div key={a.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => abrir(a.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] bg-raised px-3 py-2 text-left transition-colors hover:bg-hover"
          >
            <IconeDoBloco iconKey={a.data.iconKey} size={15} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate text-small text-text-primary">{a.data.label}</span>
            <ChevronRight size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          </button>
          <BotaoPequeno rotulo="Subir" onClick={() => onChange(mover(acoes, i, -1))} disabled={i === 0}>
            <ArrowUp size={13} />
          </BotaoPequeno>
        </div>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors hover:border-accent-solid hover:text-text-primary"
          >
            <Plus size={14} aria-hidden="true" /> Adicionar ação
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={12}
          className="max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto overscroll-contain"
        >
          <DropdownMenuLabel>Dados e integrações</DropdownMenuLabel>
          {ACOES.filter((k) => !k.startsWith("crm-")).map((k) => (
            <ItemDeAcao key={k} iconKey={k} escolher={adicionar} />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>CRM</DropdownMenuLabel>
          {ACOES.filter((k) => k.startsWith("crm-")).map((k) => (
            <ItemDeAcao key={k} iconKey={k} escolher={adicionar} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}

function ItemDeAcao({ iconKey, escolher }: { iconKey: IconKey; escolher: (k: IconKey) => void }) {
  return (
    <DropdownMenuItem onSelect={() => escolher(iconKey)} className="gap-2.5">
      <IconeDoBloco iconKey={iconKey} size={15} className="shrink-0 text-text-secondary" />
      {ROTULO.get(iconKey) ?? iconKey}
    </DropdownMenuItem>
  );
}

function BotaoPequeno({
  rotulo,
  onClick,
  disabled,
  perigo,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      disabled={disabled}
      className={
        "shrink-0 rounded-lg p-2 text-text-tertiary transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-40 " +
        (perigo ? "hover:text-danger" : "hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}

function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors hover:border-accent-solid hover:text-text-primary"
    >
      <Plus size={14} aria-hidden="true" /> {children}
    </button>
  );
}
