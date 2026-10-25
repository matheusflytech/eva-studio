"use client";

import * as React from "react";
import { Archive, ArrowRightLeft, ChevronDown, Download, ListPlus, Tag, ThumbsDown, ThumbsUp, Trash2, UserRound } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buscarMotivos } from "@/components/crm/negocios/mudanca-de-etapa";
import { useContrato } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import type { EntidadeCrm, FiltroCrm } from "@/lib/filtro-crm";
import { LIMITE_DO_LOTE, textoDaPrevia, type AcaoDeLote, type ResultadoDoLote } from "@/lib/lote/lote";
import type { MotivoDePerda } from "@/lib/regras-de-etapa";

// ---------------------------------------------------------------------------
// Ações em massa das listas (fase L5): barra flutuante ao selecionar, prévia
// do que vai mudar antes de aplicar (o servidor simula com as mesmas regras),
// resultado por item (bloqueados voltam listados, com link para abrir e
// corrigir) e Desfazer no toast por alguns segundos.
// Rotas: POST /api/contacts/lote e /api/deals/lote (src/lib/lote/lote.ts).
// ---------------------------------------------------------------------------

/** O que está selecionado: ids da página, ou "todos os N" do filtro. */
export interface Selecao {
  ids: Set<string>;
  todos: boolean;
}

export const SELECAO_VAZIA: Selecao = { ids: new Set(), todos: false };

interface Pedido {
  acao: AcaoDeLote;
  parametros: Record<string, unknown>;
  titulo: string;
  perigo?: boolean;
}

type Aberto =
  | { tipo: "previa"; pedido: Pedido; previa: ResultadoDoLote }
  | { tipo: "definitivo"; pedido: Pedido }
  | { tipo: "falhas"; resultado: ResultadoDoLote }
  | { tipo: "perdido" };

const DESFAZER_MS = 8000;
const n = (x: number) => x.toLocaleString("pt-BR");

async function postar(url: string, corpo: unknown): Promise<{ ok: true; r: ResultadoDoLote } | { ok: false; erro: string; codigo?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: d.error ?? "Não foi possível aplicar.", codigo: d.codigo };
    return { ok: true, r: d as ResultadoDoLote };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

function useLote({
  entidade,
  selecao,
  filtro,
  pipelineId,
  onFeito,
}: {
  entidade: EntidadeCrm;
  selecao: Selecao;
  filtro: FiltroCrm;
  pipelineId?: string;
  onFeito: () => void;
}) {
  const toast = useToast();
  const url = entidade === "contatos" ? "/api/contacts/lote" : "/api/deals/lote";
  const [aberto, setAberto] = React.useState<Aberto | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const nome = (q: number) => (entidade === "contatos" ? (q === 1 ? "contato" : "contatos") : q === 1 ? "negócio" : "negócios");

  const alvo = () => (selecao.todos ? { filtro, ...(pipelineId ? { pipelineId } : {}) } : { ids: [...selecao.ids] });

  async function simular(pedido: Pedido) {
    setOcupado(true);
    const r = await postar(url, { acao: pedido.acao, ...alvo(), parametros: pedido.parametros, simular: true });
    setOcupado(false);
    if (r.ok) return setAberto({ tipo: "previa", pedido, previa: r.r });
    if (r.codigo === "lixeira_indisponivel") return setAberto({ tipo: "definitivo", pedido });
    toast({ title: r.erro, tone: "danger" });
  }

  async function desfazer(corpo: NonNullable<ResultadoDoLote["desfazer"]>) {
    const r = await postar(url, corpo);
    onFeito();
    if (!r.ok) return toast({ title: r.erro, tone: "danger" });
    const falhou = r.r.falhas.length;
    toast({
      title: falhou ? `Desfeito em ${n(r.r.ok)}; ${n(falhou)} não voltaram` : "Desfeito",
      description: [...r.r.avisos.slice(0, 2), ...r.r.falhas.slice(0, 2).map((f) => `${f.nome}: ${f.motivo}`)].join(" ") || undefined,
      tone: falhou ? "danger" : "neutral",
    });
  }

  async function aplicar(pedido: Pedido) {
    setOcupado(true);
    const r = await postar(url, { acao: pedido.acao, ...alvo(), parametros: pedido.parametros });
    setOcupado(false);
    setAberto(null);
    if (!r.ok) return toast({ title: r.erro, tone: "danger" });
    onFeito();
    const res = r.r;
    const corpoDesfazer = res.desfazer;
    toast({
      title: `${pedido.titulo}: ${n(res.ok)} ${nome(res.ok)}`,
      description: res.falhas.length ? `${n(res.falhas.length)} não ${res.falhas.length === 1 ? "mudou" : "mudaram"} — veja a lista.` : res.avisos[0],
      tone: res.falhas.length ? "danger" : "success",
      durationMs: corpoDesfazer ? DESFAZER_MS : undefined,
      ...(corpoDesfazer ? { action: { label: "Desfazer", onClick: () => void desfazer(corpoDesfazer) } } : {}),
    });
    if (res.falhas.length) setAberto({ tipo: "falhas", resultado: res });
  }

  return { aberto, setAberto, ocupado, simular, aplicar };
}

function MenuDeEscolha({
  rotulo,
  icone,
  opcoes,
  onEscolher,
  vazio = "Nada para escolher.",
  disabled,
}: {
  rotulo: string;
  icone: React.ReactNode;
  opcoes: { grupo?: string; id: string; label: string; valor?: unknown }[];
  onEscolher: (o: { id: string; label: string; valor?: unknown }) => void;
  vazio?: string;
  disabled?: boolean;
}) {
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          {icone}
          {rotulo}
          <ChevronDown size={12} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="max-h-80 w-60 overflow-y-auto">
        {opcoes.length === 0 && <DropdownMenuLabel>{vazio}</DropdownMenuLabel>}
        {grupos.map((g, i) => (
          <React.Fragment key={g || i}>
            {i > 0 && <DropdownMenuSeparator />}
            {g && <DropdownMenuLabel>{g}</DropdownMenuLabel>}
            {opcoes
              .filter((o) => (o.grupo ?? "") === g)
              .map((o) => (
                <DropdownMenuItem key={`${g}:${o.id}`} onSelect={() => onEscolher(o)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Prévia, confirmação de apagar de vez e a lista dos que falharam. */
function ModaisDoLote({
  entidade,
  lote,
  linkDoItem,
}: {
  entidade: EntidadeCrm;
  lote: ReturnType<typeof useLote>;
  linkDoItem: (id: string) => string;
}) {
  const a = lote.aberto;
  if (!a || a.tipo === "perdido") return null;
  const fechar = () => lote.setAberto(null);
  if (a.tipo === "definitivo") {
    return (
      <Modal open onOpenChange={(v) => !v && fechar()}>
        <ModalContent
          size="sm"
          title="Apagar de vez?"
          description="A lixeira ainda não está ativada neste contrato: apagar agora é definitivo e não tem Desfazer."
          footer={
            <>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
              <Button variant="danger" loading={lote.ocupado} onClick={() => lote.simular({ ...a.pedido, parametros: { ...a.pedido.parametros, definitivo: true } })}>
                Continuar
              </Button>
            </>
          }
        >
          <span />
        </ModalContent>
      </Modal>
    );
  }
  if (a.tipo === "previa") {
    const p = a.previa;
    const nadaMuda = p.ok === 0;
    return (
      <Modal open onOpenChange={(v) => !v && fechar()}>
        <ModalContent
          title={a.pedido.titulo}
          description="Confira antes de aplicar. Nada mudou ainda."
          footer={
            <>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
              <Button variant={a.pedido.perigo ? "danger" : "primary"} disabled={nadaMuda} loading={lote.ocupado} onClick={() => lote.aplicar(a.pedido)}>
                {nadaMuda ? "Nada para aplicar" : `Aplicar em ${n(p.ok)}`}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-body">
            <p className="text-text-primary">{textoDaPrevia(p, entidade)}.</p>
            {p.truncado && <Notice tone="warning">A seleção passou de {n(LIMITE_DO_LOTE)}: a ação vale só para os primeiros {n(LIMITE_DO_LOTE)}.</Notice>}
            {p.avisos.filter((x) => !/passou de/.test(x)).length > 0 && (
              <Notice tone="info">{p.avisos.filter((x) => !/passou de/.test(x)).join(" ")}</Notice>
            )}
            {p.falhas.length > 0 && <ListaDeFalhas resultado={p} linkDoItem={linkDoItem} titulo="Vão ficar de fora" />}
          </div>
        </ModalContent>
      </Modal>
    );
  }
  return (
    <Modal open onOpenChange={(v) => !v && fechar()}>
      <ModalContent
        title={`${n(a.resultado.falhas.length)} não ${a.resultado.falhas.length === 1 ? "mudou" : "mudaram"}`}
        description="Abra cada um para corrigir (ex.: preencher os campos obrigatórios da etapa) e tente de novo."
        footer={<Button onClick={fechar}>Fechar</Button>}
      >
        <ListaDeFalhas resultado={a.resultado} linkDoItem={linkDoItem} />
      </ModalContent>
    </Modal>
  );
}

function ListaDeFalhas({ resultado, linkDoItem, titulo }: { resultado: ResultadoDoLote; linkDoItem: (id: string) => string; titulo?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {titulo && <p className="text-small font-medium text-text-secondary">{titulo}</p>}
      <ul className="max-h-72 overflow-y-auto rounded-md border border-border-subtle">
        {resultado.falhas.slice(0, 200).map((f) => (
          <li key={f.id} className="flex items-start gap-3 border-b border-border-subtle px-3 py-2 text-small last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-text-primary">{f.nome || "Sem nome"}</p>
              <p className="text-text-secondary">
                {f.faltando?.length ? `Falta: ${f.faltando.map((c) => c.rotulo).join(", ")}` : f.motivo}
              </p>
            </div>
            {!["nao_encontrado"].includes(f.codigo ?? "") && (
              <Link href={linkDoItem(f.id)} className="shrink-0 text-accent-fg hover:underline">
                Abrir
              </Link>
            )}
          </li>
        ))}
      </ul>
      {resultado.falhas.length > 200 && <p className="text-caption text-text-tertiary">E mais {n(resultado.falhas.length - 200)}.</p>}
    </div>
  );
}

function linkDeExportar(contrato: string | null, rota: string, selecao: Selecao, filtro: FiltroCrm, extras: Record<string, string> = {}): string {
  const p = new URLSearchParams(extras);
  if (selecao.todos) p.set("filtro", JSON.stringify(filtro));
  else p.set("ids", [...selecao.ids].slice(0, 500).join(","));
  return apiDoContrato(contrato, `${rota}?${p}`);
}

const linkBaixar = "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-small font-medium text-text-secondary transition-colors duration-120 hover:bg-hover hover:text-text-primary";

interface BaseDaBarra {
  selecao: Selecao;
  onSelecao: (s: Selecao) => void;
  /** Total de resultados do filtro (para "Selecionar todos os N"). */
  total: number;
  /** A página inteira está marcada? */
  paginaToda: boolean;
  filtro: FiltroCrm;
  membros: { id: string; name: string }[];
  onFeito: () => void;
}

function barraComum(p: BaseDaBarra) {
  const count = p.selecao.todos ? Math.min(p.total, LIMITE_DO_LOTE) : p.selecao.ids.size;
  return {
    count,
    total: p.total,
    allResults: p.selecao.todos,
    canSelectAll: p.paginaToda,
    onSelectAll: () => p.onSelecao({ ids: p.selecao.ids, todos: true }),
    onClear: () => p.onSelecao(SELECAO_VAZIA),
    limitNote: p.total > LIMITE_DO_LOTE ? `a ação vale para os primeiros ${n(LIMITE_DO_LOTE)}` : undefined,
  };
}

const opcoesDeDono = (membros: { id: string; name: string }[]) => [
  ...membros.map((m) => ({ id: m.id, label: m.name || "Sem nome" })),
  { id: "", label: "Sem proprietário" },
];

/** Barra de ações em massa dos contatos. */
export function AcoesEmMassaDeContatos(p: BaseDaBarra & { etiquetas: { id: string; name: string }[] }) {
  const contrato = useContrato();
  const lote = useLote({ entidade: "contatos", selecao: p.selecao, filtro: p.filtro, onFeito: p.onFeito });
  const [sequencias, setSequencias] = React.useState<{ id: string; label: string; grupo: string }[] | null>(null);

  // Sequências de todos os agentes do contrato (carrega uma vez, quando a barra aparece).
  const temSelecao = p.selecao.todos || p.selecao.ids.size > 0;
  React.useEffect(() => {
    if (!temSelecao || sequencias) return;
    let vivo = true;
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then(async (d: { agents?: { id: string; name: string }[] }) => {
        const listas = await Promise.all(
          (d.agents ?? []).slice(0, 20).map((ag) =>
            fetch(`/api/agents/${ag.id}/sequences`)
              .then((r) => (r.ok ? r.json() : { sequences: [] }))
              .then((s: { sequences?: { id: string; name: string; active: boolean }[] }) =>
                (s.sequences ?? []).map((x) => ({ id: x.id, label: `${x.name}${x.active ? "" : " (pausada)"}`, grupo: ag.name }))
              )
              .catch(() => [])
          )
        );
        if (vivo) setSequencias(listas.flat());
      })
      .catch(() => vivo && setSequencias([]));
    return () => {
      vivo = false;
    };
  }, [temSelecao, sequencias]);

  return (
    <>
      <BulkActionBar {...barraComum(p)} noun={["contato", "contatos"]}>
        <MenuDeEscolha
          rotulo="Atribuir"
          icone={<UserRound size={14} aria-hidden="true" />}
          opcoes={opcoesDeDono(p.membros)}
          onEscolher={(o) => lote.simular({ acao: "atribuir", parametros: { responsavelId: o.id || null }, titulo: `Atribuir a ${o.label}` })}
        />
        <MenuDeEscolha
          rotulo="Etiqueta"
          icone={<Tag size={14} aria-hidden="true" />}
          vazio="Nenhuma etiqueta criada."
          opcoes={[
            ...p.etiquetas.map((t) => ({ grupo: "Adicionar", id: `+${t.id}`, label: t.name, valor: { tagId: t.id, modo: "adicionar" } })),
            ...p.etiquetas.map((t) => ({ grupo: "Remover", id: `-${t.id}`, label: t.name, valor: { tagId: t.id, modo: "remover" } })),
          ]}
          onEscolher={(o) => {
            const v = o.valor as { tagId: string; modo: string };
            lote.simular({ acao: "etiqueta", parametros: v, titulo: `${v.modo === "adicionar" ? "Adicionar" : "Remover"} a etiqueta “${o.label}”` });
          }}
        />
        <MenuDeEscolha
          rotulo="Sequência"
          icone={<ListPlus size={14} aria-hidden="true" />}
          vazio={sequencias ? "Nenhuma sequência criada." : "Carregando..."}
          opcoes={sequencias ?? []}
          onEscolher={(o) => lote.simular({ acao: "sequencia", parametros: { sequenceId: o.id }, titulo: `Adicionar à sequência “${o.label}”` })}
        />
        <a href={linkDeExportar(contrato, "/api/contacts/exportar", p.selecao, p.filtro)} download className={linkBaixar}>
          <Download size={14} aria-hidden="true" />
          Exportar
        </a>
        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => lote.simular({ acao: "apagar", parametros: {}, titulo: "Apagar contatos", perigo: true })}>
          <Trash2 size={14} aria-hidden="true" />
          Apagar
        </Button>
      </BulkActionBar>
      <ModaisDoLote entidade="contatos" lote={lote} linkDoItem={(id) => `/contacts?open=${id}`} />
    </>
  );
}

/** Barra de ações em massa dos negócios (lista). */
export function AcoesEmMassaDeNegocios(
  p: BaseDaBarra & { pipelineId: string; etapas: { id: string; name: string; type: string }[] }
) {
  const contrato = useContrato();
  const lote = useLote({ entidade: "negocios", selecao: p.selecao, filtro: p.filtro, pipelineId: p.pipelineId, onFeito: p.onFeito });
  const abertas = p.etapas.filter((e) => e.type === "open");

  return (
    <>
      <BulkActionBar {...barraComum(p)} noun={["negócio", "negócios"]}>
        <MenuDeEscolha
          rotulo="Atribuir"
          icone={<UserRound size={14} aria-hidden="true" />}
          opcoes={opcoesDeDono(p.membros)}
          onEscolher={(o) => lote.simular({ acao: "atribuir", parametros: { responsavelId: o.id || null }, titulo: `Atribuir a ${o.label}` })}
        />
        <MenuDeEscolha
          rotulo="Mover"
          icone={<ArrowRightLeft size={14} aria-hidden="true" />}
          opcoes={abertas.map((e) => ({ id: e.id, label: e.name }))}
          onEscolher={(o) => lote.simular({ acao: "mover", parametros: { stageId: o.id }, titulo: `Mover para ${o.label}` })}
        />
        <Button size="sm" variant="ghost" onClick={() => lote.simular({ acao: "ganho", parametros: {}, titulo: "Marcar como ganho" })}>
          <ThumbsUp size={14} aria-hidden="true" />
          Ganho
        </Button>
        <Button size="sm" variant="ghost" onClick={() => lote.setAberto({ tipo: "perdido" })}>
          <ThumbsDown size={14} aria-hidden="true" />
          Perdido
        </Button>
        <a href={linkDeExportar(contrato, "/api/deals/exportar", p.selecao, p.filtro, { formato: "csv", pipeline: p.pipelineId })} download className={linkBaixar}>
          <Download size={14} aria-hidden="true" />
          Exportar
        </a>
        <Button size="sm" variant="ghost" onClick={() => lote.simular({ acao: "arquivar", parametros: {}, titulo: "Arquivar negócios" })}>
          <Archive size={14} aria-hidden="true" />
          Arquivar
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => lote.simular({ acao: "apagar", parametros: {}, titulo: "Apagar negócios", perigo: true })}>
          <Trash2 size={14} aria-hidden="true" />
          Apagar
        </Button>
      </BulkActionBar>
      <ModaisDoLote entidade="negocios" lote={lote} linkDoItem={(id) => `/deals/${id}`} />
      {lote.aberto?.tipo === "perdido" && (
        <MotivoEmMassa
          pipelineId={p.pipelineId}
          onCancelar={() => lote.setAberto(null)}
          onContinuar={(motivo, nota) =>
            lote.simular({ acao: "perdido", parametros: { motivoId: motivo.id, nota }, titulo: `Marcar como perdido (${motivo.rotulo})`, perigo: true })
          }
        />
      )}
    </>
  );
}

/** Motivo da perda (obrigatório, da lista do funil) antes da prévia. */
function MotivoEmMassa({
  pipelineId,
  onCancelar,
  onContinuar,
}: {
  pipelineId: string;
  onCancelar: () => void;
  onContinuar: (m: MotivoDePerda, nota: string) => void;
}) {
  const [motivos, setMotivos] = React.useState<MotivoDePerda[] | null>(null);
  const [motivoId, setMotivoId] = React.useState("");
  const [nota, setNota] = React.useState("");
  React.useEffect(() => {
    let vivo = true;
    buscarMotivos(pipelineId).then((m) => vivo && setMotivos(m));
    return () => {
      vivo = false;
    };
  }, [pipelineId]);
  const escolhido = motivos?.find((m) => m.id === motivoId);
  const pode = !!escolhido && (!escolhido.exigeNota || !!nota.trim());
  return (
    <Modal open onOpenChange={(v) => !v && onCancelar()}>
      <ModalContent
        size="sm"
        title="Marcar como perdido"
        description="O motivo vale para todos os selecionados. Na próxima tela você confere quantos mudam."
        footer={
          <>
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!pode} onClick={() => escolhido && onContinuar(escolhido, nota.trim())}>
              Continuar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Motivo da perda" required>
            <Select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} disabled={!motivos} autoFocus>
              <option value="">{motivos ? "Escolha o motivo" : "Carregando..."}</option>
              {(motivos ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={escolhido?.exigeNota ? "Nota" : "Nota (opcional)"} required={!!escolhido?.exigeNota}>
            <Textarea rows={3} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </Field>
        </div>
      </ModalContent>
    </Modal>
  );
}
