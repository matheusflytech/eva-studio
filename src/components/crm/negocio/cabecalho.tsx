"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import { Archive, ArchiveRestore, ArrowLeft, Building2, Ellipsis, Link2, Loader2, RotateCcw, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { corDeDadoDaEtapa } from "@/components/crm/negocios/stage-column";
import { type NegocioDaFicha } from "./use-ficha";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { MS_PARA_DESFAZER } from "@/lib/lixeira";
import { AgendarMensagem } from "@/components/whatsapp/agendar-mensagem";
import type { EtapaDoMovimento, ResultadoDaTentativa } from "@/components/crm/negocios/mudanca-de-etapa";

/** Botão redondo do topo (voltar, agendar, "…"). */
export const classeRedonda =
  "grid size-[34px] shrink-0 place-items-center rounded-full bg-raised px-0 text-text-secondary ring-1 ring-inset ring-border-subtle hover:bg-hover hover:text-text-primary";

/** Ganho em cápsula clara (v5): o contrário da superfície, para ser a decisão que se vê primeiro. */
export const classeDoGanho = "border-transparent bg-inverse text-inverse-fg hover:bg-inverse hover:opacity-90";

/**
 * Topo da ficha (v5): voltar, o que é (título editável, grande e leve), em
 * que etapa está, e à direita agendar mensagem, "…" (copiar link, arquivar,
 * apagar) e as duas decisões que encerram o negócio. Embaixo, numa linha só,
 * o funil e de quem é (empresa e contato com link).
 */
export function CabecalhoDoNegocio({
  deal,
  patch,
  onErro,
  moverEtapa,
}: {
  deal: NegocioDaFicha;
  patch: (body: Record<string, unknown>) => Promise<string | null>;
  onErro: (msg: string | null) => void;
  moverEtapa: (para: EtapaDoMovimento | null, extra?: Record<string, unknown>) => Promise<ResultadoDaTentativa>;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<"ganho" | "perdido" | "reabrir" | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  const etapaGanha = deal.pipeline.stages.find((s) => s.type === "won");
  const etapaPerdida = deal.pipeline.stages.find((s) => s.type === "lost");
  const fechado = deal.stage.type !== "open";
  const contato = deal.contacts[0]?.contact;
  const ponto = CATEGORY_CLASSES[corDeDadoDaEtapa(deal.stage.color, deal.stage.type)].solid;

  /** Ganho, Perdido e Reabrir passam pelas regras da etapa (modais da ficha). */
  async function decidir(tipo: "ganho" | "perdido" | "reabrir", para: EtapaDoMovimento | null) {
    setOcupado(tipo);
    await moverEtapa(para, tipo === "reabrir" ? { reabrir: true } : undefined);
    setOcupado(null);
  }

  const toast = useToast();
  const apagarComDesfazer = useApagarComDesfazer();

  /** Arquivar/desarquivar sem confirmação: o toast desfaz. */
  async function alternarArquivo() {
    const arquivar = !deal.archivedAt;
    const falha = await patch({ archived: arquivar });
    onErro(falha);
    if (falha) return;
    toast({
      title: arquivar ? "Negócio arquivado" : "Negócio desarquivado",
      durationMs: MS_PARA_DESFAZER,
      action: { label: "Desfazer", onClick: async () => onErro(await patch({ archived: !arquivar })) },
    });
  }

  /** Apagar sem confirmação: vai para a lixeira e o toast desfaz (volta para esta ficha). */
  async function apagar() {
    onErro(null);
    const id = deal.id;
    const r = await apagarComDesfazer({
      url: `/api/deals/${id}`,
      titulo: "Negócio apagado",
      perguntaSemLixeira: `A lixeira ainda não está ativada: apagar "${deal.name}" leva junto as tarefas e notas e não tem volta. Apagar mesmo assim?`,
      aoRestaurar: () => router.push(`/negocios/${id}`),
    });
    if (r.ok) router.push("/negocios");
    else if (r.erro) onErro(r.erro);
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
    <header className="flex flex-col gap-1">
      <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/negocios" aria-label="Voltar para Negócios" title="Voltar para Negócios" className={cn(classeRedonda, "outline-none focus-visible:ring-2 focus-visible:ring-focus")}>
          <ArrowLeft size={15} aria-hidden />
        </Link>
        <TituloEditavel valor={deal.name} onSalvar={(name) => patch({ name })} />
        <span
          data-etapa-atual
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-raised px-3 text-small font-medium text-text-primary ring-1 ring-inset ring-border-subtle"
        >
          <span aria-hidden className={cn("size-2 rounded-full", ponto)} />
          {deal.stage.name}
        </span>
        {deal.archivedAt && <Badge>Arquivado</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {deal.contacts.length > 0 && (
            <span title="Agendar mensagem" className="inline-flex">
              {/* O texto continua no botão (nome acessível); some só da tela, para ficar redondo. */}
              <AgendarMensagem
                dealId={deal.id}
                contatos={deal.contacts.map((c) => ({ id: c.contact.id, name: c.contact.name }))}
                className={cn(classeRedonda, "gap-0 [font-size:0] [&_svg]:size-[15px]")}
              />
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" aria-label="Mais ações" title="Mais ações" className={classeRedonda}>
                <Ellipsis size={15} />
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
              <DropdownMenuItem onSelect={() => void alternarArquivo()}>
                {deal.archivedAt ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                {deal.archivedAt ? "Desarquivar" : "Arquivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => void apagar()}>
                <Trash2 size={15} aria-hidden /> Apagar negócio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!fechado && etapaPerdida && (
            <Button variant="secondary" disabled={!!ocupado} onClick={() => decidir("perdido", etapaPerdida)}>
              {ocupado === "perdido" ? <Loader2 size={14} className="animate-spin" /> : null} Perdido
            </Button>
          )}
          {!fechado && etapaGanha && (
            <Button variant="secondary" disabled={!!ocupado} onClick={() => decidir("ganho", etapaGanha)} className={classeDoGanho}>
              {ocupado === "ganho" ? <Loader2 size={14} className="animate-spin" /> : null} Ganho
            </Button>
          )}
          {fechado && (
            <Button variant="secondary" disabled={!!ocupado} loading={ocupado === "reabrir"} onClick={() => decidir("reabrir", null)}>
              {ocupado !== "reabrir" && <RotateCcw size={14} aria-hidden />} Reabrir
            </Button>
          )}
        </div>
      </div>

      <nav aria-label="Trilha de navegação" className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[46px] font-mono text-caption text-text-tertiary">
        <Link href="/negocios" className="rounded outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus">
          Negócios
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-text-secondary">{deal.pipeline.name}</span>
        {deal.company && (
          <>
            <span aria-hidden>·</span>
            <Link
              href={`/empresas/${deal.company.id}`}
              className="inline-flex items-center gap-1 rounded outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Building2 size={12} aria-hidden /> {deal.company.name}
            </Link>
          </>
        )}
        {contato && (
          <>
            <span aria-hidden>·</span>
            <Link
              href={`/contatos?abrir=${contato.id}`}
              className="inline-flex items-center gap-1 rounded outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            >
              <User size={12} aria-hidden /> {contato.name || contato.phone || contato.email || "Sem nome"}
              {deal.contacts.length > 1 && <span>+{deal.contacts.length - 1}</span>}
            </Link>
          </>
        )}
      </nav>
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
    <div className="min-w-0 max-w-full shrink">
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
          // O campo cresce com o texto: o chip da etapa fica colado ao título.
          "min-w-[8ch] max-w-full truncate rounded-xl border border-transparent bg-transparent px-1.5 py-0.5 text-display font-medium tracking-[-0.035em] text-text-primary outline-none transition-colors [field-sizing:content]",
          "hover:border-border-subtle focus:border-accent-solid focus:bg-raised focus:ring-2 focus:ring-accent-solid/20",
          erro && "border-danger"
        )}
      />
      {erro && <p role="alert" className="px-1 text-caption text-danger">{erro}</p>}
    </div>
  );
}
