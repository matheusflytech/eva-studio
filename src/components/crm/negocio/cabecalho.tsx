"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, ArchiveRestore, Building2, ChevronRight, Ellipsis, Link2, Loader2, ThumbsDown, ThumbsUp, Trash2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalContent } from "@/components/ui/modal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { dinheiro } from "@/components/crm/negocios/modelo";
import { mensagemDeErro, type Membro, type NegocioDaFicha } from "./use-ficha";
import { AgendarMensagem } from "@/components/whatsapp/agendar-mensagem";

/**
 * Topo da ficha: onde estou (funil), o que é (título editável), de quem
 * (empresa e contato com link), quanto vale, quem cuida, e as duas decisões
 * que encerram o negócio.
 */
export function CabecalhoDoNegocio({
  deal,
  membros,
  patch,
  onErro,
}: {
  deal: NegocioDaFicha;
  membros: Membro[];
  patch: (body: Record<string, unknown>) => Promise<string | null>;
  onErro: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<"ganho" | "perdido" | "dono" | null>(null);
  const [pedindoMotivo, setPedindoMotivo] = React.useState(false);
  const [confirmandoApagar, setConfirmandoApagar] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);

  const etapaGanha = deal.pipeline.stages.find((s) => s.type === "won");
  const etapaPerdida = deal.pipeline.stages.find((s) => s.type === "lost");
  const fechado = deal.stage.type !== "open";
  const contato = deal.contacts[0]?.contact;

  async function agir(tipo: "ganho" | "perdido" | "dono", body: Record<string, unknown>) {
    setOcupado(tipo);
    onErro(null);
    const falha = await patch(body);
    setOcupado(null);
    onErro(falha);
    return !falha;
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      onErro("Não foi possível copiar o link.");
    }
  }

  return (
    <header className="flex flex-col gap-3">
      <nav aria-label="Trilha de navegação" className="flex items-center gap-1 text-[12.5px] text-text-tertiary">
        <Link
          href="/negocios"
          className="rounded outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          Negócios
        </Link>
        <ChevronRight size={13} aria-hidden />
        <span className="truncate text-text-secondary">{deal.pipeline.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TituloEditavel valor={deal.name} onSalvar={(name) => patch({ name })} />
            {deal.stage.type === "won" && <Badge variant="success">Ganho</Badge>}
            {deal.stage.type === "lost" && <Badge variant="danger">Perdido</Badge>}
            {deal.archivedAt && <Badge>Arquivado</Badge>}
          </div>
          {(deal.company || contato) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[13px] text-text-secondary">
              {deal.company && (
                <Link
                  href={`/empresas/${deal.company.id}`}
                  className="inline-flex items-center gap-1.5 rounded outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
                >
                  <Building2 size={13} aria-hidden className="text-text-tertiary" /> {deal.company.name}
                </Link>
              )}
              {contato && (
                <Link
                  href={`/contatos?abrir=${contato.id}`}
                  className="inline-flex items-center gap-1.5 rounded outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
                >
                  <User size={13} aria-hidden className="text-text-tertiary" /> {contato.name || contato.phone || contato.email || "Sem nome"}
                  {deal.contacts.length > 1 && <span className="text-text-tertiary">+{deal.contacts.length - 1}</span>}
                </Link>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {deal.contacts.length > 0 && (
            <AgendarMensagem dealId={deal.id} contatos={deal.contacts.map((c) => ({ id: c.contact.id, name: c.contact.name }))} />
          )}
          {!fechado && etapaGanha && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!!ocupado}
              onClick={() => agir("ganho", { stageId: etapaGanha.id })}
              className="border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/10"
            >
              {ocupado === "ganho" ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} aria-hidden />} Ganho
            </Button>
          )}
          {!fechado && etapaPerdida && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!!ocupado}
              onClick={() => setPedindoMotivo(true)}
              className="border-rose-500/30 text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/10"
            >
              <ThumbsDown size={14} aria-hidden /> Perdido
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Mais ações" title="Mais ações" className="h-8 w-8">
                <Ellipsis size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  copiarLink();
                }}
              >
                <Link2 size={15} aria-hidden /> {copiado ? "Link copiado" : "Copiar link"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  onErro(await patch({ archived: !deal.archivedAt }));
                }}
              >
                {deal.archivedAt ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                {deal.archivedAt ? "Desarquivar" : "Arquivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmandoApagar(true)} className="text-danger data-[highlighted]:text-danger">
                <Trash2 size={15} aria-hidden /> Apagar negócio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <dl className="flex flex-wrap items-end gap-x-8 gap-y-3 px-1">
        <div>
          <dt className="text-[11.5px] text-text-tertiary">Valor</dt>
          <dd className="font-display text-[22px] font-semibold tabular-nums leading-tight text-text-primary">
            {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="text-[15px] font-normal text-text-tertiary">Sem valor</span>}
          </dd>
        </div>
        {deal.stage.type === "open" && (
          <div>
            <dt className="text-[11.5px] text-text-tertiary">Ponderado ({deal.probability}%)</dt>
            <dd className="font-display text-[15px] font-medium tabular-nums text-text-secondary">
              {dinheiro(Math.round((deal.amountCents * deal.probability) / 100))}
            </dd>
          </div>
        )}
        <div className="w-[200px]">
          <dt>
            <label htmlFor="ficha-dono" className="text-[11.5px] text-text-tertiary">
              Responsável
            </label>
          </dt>
          <dd className="mt-0.5">
            <Select
              id="ficha-dono"
              value={deal.ownerId ?? ""}
              disabled={ocupado === "dono"}
              onChange={(e) => agir("dono", { ownerId: e.target.value || null })}
              className="h-8 rounded-lg text-[13px]"
            >
              <option value="">Sem responsável</option>
              {/* Dono atual que saiu da equipe continua aparecendo, senão o select mostraria "Sem responsável". */}
              {deal.owner && !membros.some((m) => m.id === deal.owner!.id) && (
                <option value={deal.owner.id}>{deal.owner.name || "Sem nome"}</option>
              )}
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </Select>
          </dd>
        </div>
      </dl>

      {pedindoMotivo && etapaPerdida && (
        <MotivoDaPerda
          onFechar={() => setPedindoMotivo(false)}
          onConfirmar={async (motivo) => {
            const ok = await agir("perdido", { stageId: etapaPerdida.id, lostReason: motivo });
            if (ok) setPedindoMotivo(false);
          }}
          ocupado={ocupado === "perdido"}
        />
      )}

      {confirmandoApagar && (
        <ConfirmarApagar
          nome={deal.name}
          onFechar={() => setConfirmandoApagar(false)}
          onConfirmar={async () => {
            onErro(null);
            try {
              const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
              if (!res.ok) {
                onErro(await mensagemDeErro(res, "Não foi possível apagar o negócio."));
                setConfirmandoApagar(false);
                return;
              }
              router.push("/negocios");
            } catch {
              onErro("Sem conexão. Tente de novo.");
              setConfirmandoApagar(false);
            }
          }}
        />
      )}
    </header>
  );
}

function TituloEditavel({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => Promise<string | null> }) {
  const [rascunho, setRascunho] = React.useState(valor);
  const [erro, setErro] = React.useState<string | null>(null);
  const [valorAnterior, setValorAnterior] = React.useState(valor);
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    setRascunho(valor);
  }

  async function salvar() {
    const v = rascunho.trim();
    // Título vazio não existe: volta ao anterior em vez de gravar nada.
    if (!v || v === valor) {
      setRascunho(valor);
      return;
    }
    const falha = await onSalvar(v);
    setErro(falha);
    if (falha) setRascunho(valor);
  }

  return (
    <div className="min-w-0 max-w-full flex-1 basis-[280px]">
      <h1 className="sr-only">{valor}</h1>
      <input
        aria-label="Nome do negócio"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setRascunho(valor);
            e.currentTarget.blur();
          }
        }}
        maxLength={200}
        className={cn(
          "w-full truncate rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-display text-[24px] font-semibold tracking-[-0.01em] text-text-primary outline-none transition-colors",
          "hover:border-border-subtle focus:border-accent-500/60 focus:bg-surface-2 focus:ring-2 focus:ring-accent-500/20",
          erro && "border-danger/50"
        )}
      />
      {erro && <p role="alert" className="px-1 text-[12px] text-danger">{erro}</p>}
    </div>
  );
}

function MotivoDaPerda({
  onFechar,
  onConfirmar,
  ocupado,
}: {
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
  ocupado: boolean;
}) {
  const [motivo, setMotivo] = React.useState("");
  return (
    <Modal open onOpenChange={(aberto) => !aberto && onFechar()}>
      <ModalContent title="Marcar como perdido" description="O motivo entra no relatório de perdas e ajuda a vender melhor da próxima vez.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim()) onConfirmar(motivo.trim());
          }}
        >
          <div>
            <Label htmlFor="ficha-motivo">Motivo da perda</Label>
            <Input
              id="ficha-motivo"
              autoFocus
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Preço, prazo, concorrente..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={!motivo.trim() || ocupado}>
              {ocupado && <Loader2 size={15} className="animate-spin" />} Marcar como perdido
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

function ConfirmarApagar({ nome, onFechar, onConfirmar }: { nome: string; onFechar: () => void; onConfirmar: () => Promise<void> }) {
  const [apagando, setApagando] = React.useState(false);
  return (
    <Modal open onOpenChange={(aberto) => !aberto && onFechar()}>
      <ModalContent title="Apagar negócio?" description={`"${nome}" some junto com as tarefas e notas dele. Não dá para desfazer.`}>
        <p className="mb-5 text-[13px] text-text-secondary">
          Se a ideia é só tirar do funil, arquivar guarda o histórico.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} autoFocus>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={apagando}
            onClick={async () => {
              setApagando(true);
              await onConfirmar();
              setApagando(false);
            }}
          >
            {apagando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} aria-hidden />} Apagar
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
