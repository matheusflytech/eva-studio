"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Clock,
  MoreHorizontal, PauseCircle, Plus, RefreshCw, XCircle, type LucideIcon,
} from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { focusRing } from "@/components/ui/styles";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CriarTemplate } from "@/components/aprovacoes/criar-template";
import { CATEGORIAS } from "@/lib/whatsapp/template-meta";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";
import { formatarSaoPaulo } from "@/lib/fuso-sp";
import { pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aprovações.
//
// Fora da janela de 24 horas, o WhatsApp oficial só entrega mensagem por
// template aprovado pela Meta. O app já deixava configurar QUAL template usar,
// mas nunca perguntava à Meta se aquele template existe e está aprovado — dava
// pra apontar para um rejeitado e só descobrir quando o disparo não chegasse
// em ninguém.
//
// Esta tela faz as duas perguntas ao mesmo tempo: o que a Meta aprovou, e o
// que está configurado aqui apontando para o vazio. A segunda é a que salva
// campanha, por isso vira um aviso no topo ("Ver quais" abre o motivo de cada
// uma e o atalho para o Builder). Na lista, cada template tem nome, categoria
// e status; idioma, qualidade e o texto abrem ao clicar na linha. O que tem
// problema sobe para o topo.
// ---------------------------------------------------------------------------

interface TemplateMeta {
  id: string;
  nome: string;
  status: string;
  categoria: string;
  idioma: string;
  corpo: string;
  motivoRejeicao: string | null;
  qualidade: string | null;
  usadoAqui: boolean;
}

interface TemplateLocal {
  id: string;
  nome: string;
  metaTemplateName: string;
  idioma: string;
  corpo: string;
  situacao: string | null;
  /** true = a Meta não respondeu agora e o status é o último aviso do webhook. */
  situacaoReserva?: boolean;
  motivoGravado?: string | null;
  statusGravadoEm?: string | null;
}

interface Payload {
  conectado: boolean;
  wabaId?: string;
  erro?: string | null;
  templates: TemplateMeta[];
  locais: TemplateLocal[];
}

type Tom = "success" | "warning" | "danger" | "neutral";

const STATUS: Record<string, { rotulo: string; tom: Tom; icone: LucideIcon }> = {
  APPROVED: { rotulo: "Aprovado", tom: "success", icone: CheckCircle2 },
  PENDING: { rotulo: "Em análise", tom: "warning", icone: Clock },
  IN_APPEAL: { rotulo: "Em recurso", tom: "warning", icone: Clock },
  REJECTED: { rotulo: "Rejeitado", tom: "danger", icone: XCircle },
  PAUSED: { rotulo: "Pausado", tom: "danger", icone: PauseCircle },
  DISABLED: { rotulo: "Desativado", tom: "danger", icone: XCircle },
  FLAGGED: { rotulo: "Sinalizado", tom: "warning", icone: AlertTriangle },
  REINSTATED: { rotulo: "Reativado", tom: "success", icone: CheckCircle2 },
  PENDING_DELETION: { rotulo: "Sendo apagado", tom: "neutral", icone: Clock },
  AUSENTE: { rotulo: "Não existe na Meta", tom: "danger", icone: AlertTriangle },
};

function Etiqueta({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, tom: "neutral" as const, icone: Clock };
  const Icone = s.icone;
  return (
    <Badge variant={s.tom}>
      <Icone size={11} aria-hidden /> {s.rotulo}
    </Badge>
  );
}

/** Só estes entregam. Qualquer outro estado é uma mensagem que não sai. */
function entrega(status: string | null): boolean {
  return status === "APPROVED";
}

/** "INVALID_FORMAT" → "invalid format" (o código da Meta, legível). */
const motivoLegivel = (m: string) => m.toLowerCase().replaceAll("_", " ");
const rotuloDaCategoria = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c.toLowerCase();

// Cor do agente é identidade (a mesma em qualquer tela que o mostre num quadrado).
const CORES: CategoryColor[] = ["teal", "blue", "rose", "amber", "violet", "cyan", "green", "orange", "indigo"];
function QuadradoDoAgente({ id, nome }: { id: string; nome: string }) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const cor = CATEGORY_CLASSES[CORES[Math.abs(h) % CORES.length]];
  return (
    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-md text-caption font-bold", cor.subtle, cor.fg)}>
      {(nome.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

export default function AprovacoesPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState("");
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [criando, setCriando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [verQuebrados, setVerQuebrados] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const carregar = React.useCallback(async () => {
    if (!agentId) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/meta-templates`);
      setDados(res.ok ? await res.json() : null);
    } finally {
      setCarregando(false);
    }
  }, [agentId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  // O que precisa de ação: modelo configurado aqui que não entrega lá.
  const quebrados = (dados?.locais ?? []).filter(
    (l) => l.metaTemplateName && l.situacao !== null && !entrega(l.situacao)
  );
  const semVinculo = (dados?.locais ?? []).filter((l) => !l.metaTemplateName);
  // Problema primeiro (ordem estável: dentro de cada grupo, a da Meta).
  const templates = React.useMemo(
    () => [...(dados?.templates ?? [])].sort((a, b) => Number(entrega(a.status)) - Number(entrega(b.status))),
    [dados]
  );
  const aprovados = templates.filter((t) => entrega(t.status)).length;
  const agente = agents.find((a) => a.id === agentId);

  const rotulo = dados?.conectado && !dados.erro ? `${templates.length} ${templates.length === 1 ? "template" : "templates"}` : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra única: título e contagem, o agente, e à direita o "…" e a ação principal. */}
      <div className="flex min-h-[58px] flex-wrap items-center gap-x-2.5 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Aprovações</h1>
        {rotulo && <span className="mt-1 font-mono text-caption tabular-nums text-text-tertiary">{rotulo}</span>}
        {agents.length > 0 && (
          <>
            <span aria-hidden className="mx-1 hidden h-4.5 w-px bg-border-default sm:block" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="max-w-[220px] pl-1.5 text-text-primary" aria-label={`Agente: ${agente?.name ?? "escolher"}`}>
                  {agente && <QuadradoDoAgente id={agente.id} nome={agente.name} />}
                  <span className="truncate">{agente?.name ?? "Escolher agente"}</span>
                  <ChevronDown size={14} aria-hidden className="text-text-tertiary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Agente</DropdownMenuLabel>
                {agents.map((a) => (
                  <DropdownMenuCheckboxItem key={a.id} checked={a.id === agentId} onSelect={() => setAgentId(a.id)}>
                    <span className="truncate">{a.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais ações de aprovações" variant="secondary">
                <MoreHorizontal aria-hidden />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => void carregar()} disabled={!agentId || carregando}>
                <RefreshCw aria-hidden className={cn(carregando && "animate-spin")} /> Consultar a Meta de novo
              </DropdownMenuItem>
              {dados?.conectado && (
                <DropdownMenuItem asChild>
                  <a
                    href={`https://business.facebook.com/wa/manage/message-templates/${dados.wabaId ? `?waba_id=${encodeURIComponent(dados.wabaId)}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LogoOficial marca="meta" tamanho={16} /> Gerenciador da Meta
                  </a>
                </DropdownMenuItem>
              )}
              {dados?.wabaId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-normal">
                    Conta de negócio <span className="font-mono tabular-nums">{dados.wabaId}</span>
                  </DropdownMenuLabel>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {dados?.conectado && (
            <Button variant="primary" onClick={() => setCriando(true)}>
              <Plus size={14} aria-hidden /> Novo template
            </Button>
          )}
        </div>
      </div>

      {agentId && (
        <CriarTemplate
          agentId={agentId}
          aberto={criando}
          onFechar={() => setCriando(false)}
          onCriado={(nome) => {
            setCriando(false);
            pulsar(null, 1.2);
            setAviso(`Template ${nome} enviado. A Meta revisa em minutos ou até 24h; o status muda aqui sozinho.`);
            void carregar();
          }}
        />
      )}

      <div className="flex w-full flex-col gap-7 pt-2">
        {aviso && (
          <Notice tone="info" onDismiss={() => setAviso(null)}>
            {aviso}
          </Notice>
        )}

        {!isLoaded || (carregando && !dados) ? (
          <div role="status" aria-label="Consultando a Meta" className="flex flex-col">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="flex h-15 flex-col justify-center gap-2 border-b border-border-subtle px-1 last:border-b-0">
                <span className="h-3 w-44 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
                <span className="h-2.5 w-24 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
              </span>
            ))}
          </div>
        ) : !dados?.conectado ? (
          <EmptyState
            icon={<LogoOficial marca="whatsapp" tamanho={18} />}
            title="Este agente não tem o WhatsApp oficial conectado"
            description="Template aprovado é coisa da Cloud API da Meta: sem a conexão oficial não há o que aprovar."
            action={
              agentId ? (
                <Link href={`/agent-studio/${agentId}`} className={buttonVariants({ variant: "primary", size: "md" })}>
                  Conectar na aba do agente <ArrowRight size={14} aria-hidden />
                </Link>
              ) : undefined
            }
          />
        ) : dados.erro ? (
          <div className="flex flex-col gap-4">
            <Notice tone="warning">
              <p className="font-medium">Não deu para consultar a Meta</p>
              <p className="mt-0.5">{dados.erro}</p>
              <p className="mt-1 opacity-80">
                Costuma ser token expirado ou sem permissão na conta de negócio. A tela não inventa status: abaixo, só o último aviso que a
                própria Meta mandou pelo webhook, com a data.
              </p>
            </Notice>
            {dados.locais.some((l) => l.situacaoReserva) && (
              <section aria-labelledby="ultimo-aviso" className="flex flex-col">
                <h2 id="ultimo-aviso" className="px-1 pb-2 font-mono text-caption uppercase tracking-wider text-text-tertiary">
                  Último aviso da Meta
                </h2>
                <ul className="flex flex-col">
                  {dados.locais
                    .filter((l) => l.situacaoReserva)
                    .map((l) => (
                      <li key={l.id} className="flex min-h-15 items-center gap-3.5 border-b border-border-subtle px-1 py-2.5 last:border-b-0">
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-mono text-small text-text-primary">{l.metaTemplateName}</span>
                          <span className="truncate text-caption text-text-tertiary">
                            {l.statusGravadoEm ? `em ${formatarSaoPaulo(l.statusGravadoEm)}` : "sem data"}
                            {l.motivoGravado ? ` · ${motivoLegivel(l.motivoGravado)}` : ""}
                          </span>
                        </span>
                        <Etiqueta status={l.situacao ?? "AUSENTE"} />
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <>
            {/* O alarme vem antes da lista: quem abre esta tela quer saber se tem
                algo quebrado, não navegar por um catálogo. */}
            {quebrados.length > 0 && (
              <div className="flex flex-col gap-2">
                <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] bg-danger-subtle px-3.5 py-3 text-small text-danger">
                  <AlertTriangle size={16} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <b className="font-semibold">{quebrados.length === 1 ? "1 mensagem" : `${quebrados.length} mensagens`}</b> deste agente não{" "}
                    {quebrados.length === 1 ? "sai" : "saem"} fora da janela de 24h
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-text-primary"
                    aria-expanded={verQuebrados}
                    aria-controls="mensagens-quebradas"
                    onClick={() => setVerQuebrados((v) => !v)}
                  >
                    {verQuebrados ? "Esconder" : "Ver quais"}
                    <ChevronRight size={14} aria-hidden className={cn("transition-transform duration-150", verQuebrados && "rotate-90")} />
                  </Button>
                </div>
                {verQuebrados && (
                  <div id="mensagens-quebradas" className="rounded-[18px] border border-border-subtle bg-panel px-3 py-2">
                    <p className="px-1 pb-1 pt-1 text-small text-text-secondary">
                      Estão configuradas no Builder apontando para um template que a Meta não aprovou. Fora da janela de 24h, a mensagem
                      simplesmente não sai.
                    </p>
                    <ul className="flex flex-col">
                      {quebrados.map((l) => (
                        <li key={l.id} className="flex min-h-14 items-center gap-3.5 border-b border-border-subtle px-1 py-2 last:border-b-0">
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-small text-text-primary">{l.nome}</span>
                            <span className="truncate font-mono text-caption text-text-tertiary">
                              {l.metaTemplateName} · {l.idioma}
                            </span>
                          </span>
                          <Etiqueta status={l.situacao ?? "AUSENTE"} />
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/agent-studio/${agentId}/builder`}
                      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "my-1.5 ml-1")}
                    >
                      Abrir o Builder <ArrowRight size={13} aria-hidden />
                    </Link>
                  </div>
                )}
              </div>
            )}

            <section aria-labelledby="templates-na-meta" className="flex flex-col">
              <h2 id="templates-na-meta" className="flex items-center px-1 pb-2 font-mono text-caption uppercase tracking-wider text-text-tertiary">
                Templates na Meta
                {templates.length > 0 && (
                  <span className="ml-auto normal-case tracking-normal tabular-nums">
                    {aprovados} {aprovados === 1 ? "aprovado" : "aprovados"}
                  </span>
                )}
              </h2>

              {templates.length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhum template nesta conta de negócio ainda"
                  description="Crie o primeiro e mande para a Meta revisar."
                  action={
                    <Button variant="primary" onClick={() => setCriando(true)}>
                      Novo template
                    </Button>
                  }
                />
              ) : (
                <ul className="flex flex-col">
                  {templates.map((t) => (
                    <LinhaDoTemplate key={t.id} t={t} aberto={aberto === t.id} onAlternar={() => setAberto((a) => (a === t.id ? null : t.id))} />
                  ))}
                </ul>
              )}
              <p className="px-1 pt-3 text-caption text-text-tertiary">Editar e apagar continuam no Gerenciador da Meta (no &quot;…&quot;).</p>
            </section>

            {semVinculo.length > 0 && (
              <section aria-labelledby="sem-template" className="flex flex-col">
                <h2 id="sem-template" className="flex items-center px-1 pb-2 font-mono text-caption uppercase tracking-wider text-text-tertiary">
                  Modelos sem template da Meta
                  <span className="ml-auto normal-case tracking-normal tabular-nums">{semVinculo.length}</span>
                </h2>
                <p className="px-1 pb-2 text-small text-text-secondary">Funcionam dentro da janela de 24h, como texto livre. Fora dela, não saem.</p>
                <ul className="flex flex-col">
                  {semVinculo.map((l) => (
                    <li key={l.id} className="flex min-h-15 flex-col justify-center gap-0.5 border-b border-border-subtle px-1 py-2.5 last:border-b-0">
                      <span className="truncate text-small text-text-primary">{l.nome}</span>
                      <span className="line-clamp-1 text-caption text-text-tertiary">{l.corpo}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Nome, categoria e status; o resto (idioma, qualidade, texto) abre na própria linha. */
function LinhaDoTemplate({ t, aberto, onAlternar }: { t: TemplateMeta; aberto: boolean; onAlternar: () => void }) {
  const idDetalhe = `template-${t.id}`;
  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        className={cn("flex min-h-15 w-full items-center gap-3.5 rounded-xl px-1 py-2.5 text-left transition-colors duration-120 hover:bg-raised", focusRing)}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono text-small text-text-primary">{t.nome}</span>
          {t.motivoRejeicao ? (
            <span className="truncate text-caption text-danger">Recusado: {motivoLegivel(t.motivoRejeicao)}</span>
          ) : (
            <span className="truncate text-caption text-text-tertiary">
              {rotuloDaCategoria(t.categoria)}
              {t.usadoAqui ? " · em uso" : ""}
            </span>
          )}
        </span>
        <Etiqueta status={t.status} />
        <ChevronRight size={14} aria-hidden className={cn("shrink-0 text-text-tertiary transition-transform duration-150", aberto && "rotate-90")} />
      </button>
      {aberto && (
        <div id={idDetalhe} className="flex flex-col gap-2 px-1 pb-3">
          <p className="font-mono text-caption text-text-tertiary">
            {[rotuloDaCategoria(t.categoria), t.idioma, t.qualidade ? `qualidade ${t.qualidade.toLowerCase()}` : null, t.usadoAqui ? "em uso aqui" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {t.corpo && <p className="whitespace-pre-wrap rounded-[14px] bg-raised px-3 py-2 text-small leading-relaxed text-text-secondary">{t.corpo}</p>}
          {t.motivoRejeicao && (
            <p className="flex items-start gap-1.5 text-caption text-danger">
              <XCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
              Motivo da recusa: {motivoLegivel(t.motivoRejeicao)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
