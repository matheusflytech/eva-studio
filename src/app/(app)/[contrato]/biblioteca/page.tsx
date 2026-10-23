"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowRight, Loader2, Mail, Webhook, Workflow } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { FLOW_TEMPLATES } from "@/components/agent-studio/builder/flow-templates";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";
import { IconeDoBloco, seloDoBloco } from "@/components/agent-studio/builder/icone-do-bloco";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { MarcaEva } from "@/components/layout/marca-eva";
import { saveFlow } from "@/lib/data/flows";
import { pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "@/lib/contrato/navegacao";
import { ModelosDeEmail } from "@/components/biblioteca/modelos-de-email";
import { SeletorDeAgente } from "@/components/biblioteca/seletor-de-agente";

// ---------------------------------------------------------------------------
// Biblioteca.
//
// Mostra os modelos DE VERDADE — os mesmos que o builder aplica, lidos de
// FLOW_TEMPLATES — e aplica no agente que você escolher.
//
// v5: uma linha por modelo (ícone, nome, frase curta com a contagem de
// blocos, Aplicar). A ordem dos blocos e o aviso de que aplicar substitui o
// fluxo atual (destrutivo, sem desfazer) ficam na confirmação, com o nome do
// agente que vai perder o fluxo. O agente mora ao lado do título. No desktop
// (≥1280px) as linhas viram cartões numa grade de 2 colunas.
// ---------------------------------------------------------------------------

type Template = (typeof FLOW_TEMPLATES)[number];

/** Modelo com bloco de IA leva o símbolo da Eva; o do n8n, o logo do n8n; o de webhook, o do webhook. */
function iconeDoModelo(chaves: IconKey[]) {
  if (chaves.includes("ai-agent")) return "eva" as const;
  if (chaves.includes("agent")) return "n8n" as const;
  if (chaves.includes("webhook")) return Webhook;
  return Workflow;
}

function ModelosDeFluxo({ agentId, agenteNome, semAgentes }: { agentId: string; agenteNome: string | undefined; semAgentes: boolean }) {
  const [aplicando, setAplicando] = React.useState<string | null>(null);
  const [aplicado, setAplicado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  // Modelo aberto na confirmação (a ordem dos blocos + o aviso destrutivo).
  const [aberto, setAberto] = React.useState<Template | null>(null);
  const linhaRef = React.useRef<Record<string, HTMLElement | null>>({});

  async function aplicar(templateId: string) {
    if (!agentId) return;
    const template = FLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    setAberto(null);
    setAplicando(templateId);
    setErro(null);
    try {
      await saveFlow(agentId, template.build());
      setAplicado(templateId);
      pulsar(linhaRef.current[templateId], 1.2);
      setTimeout(() => setAplicado(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  if (semAgentes) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <p className="text-body text-text-secondary">Modelo se aplica num agente. Crie o primeiro e volte aqui.</p>
        <Link href="/agent-studio/new" className={buttonVariants({ variant: "primary", size: "md" })}>
          Criar agente <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const blocosDoAberto = aberto ? aberto.build().nodes.filter((n) => n.data.iconKey !== "start") : [];

  return (
    <div className="flex w-full flex-col">
      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)} className="mb-3">
          {erro}
        </Notice>
      )}

      {/* Ocupa a largura: linhas abaixo de 1280px, grade de cartões em 2 colunas acima. */}
      <ul className="flex flex-col xl:grid xl:grid-cols-2 xl:gap-3">
        {FLOW_TEMPLATES.map((tpl) => {
          const { nodes } = tpl.build();
          const chaves = nodes.map((n) => n.data.iconKey as IconKey);
          const Icone = iconeDoModelo(chaves);
          const foiAplicado = aplicado === tpl.id;
          return (
            <li
              key={tpl.id}
              ref={(el) => {
                linhaRef.current[tpl.id] = el;
              }}
              className={cn(
                "flex min-h-[72px] items-center gap-3.5 px-1 py-3",
                "max-xl:border-b max-xl:border-border-subtle max-xl:last:border-b-0",
                "xl:min-h-[96px] xl:rounded-[18px] xl:border xl:border-border-subtle xl:bg-panel xl:px-4 xl:py-4"
              )}
            >
              <span
                className={cn(
                  "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-raised",
                  Icone === "eva" ? "text-text-primary" : "text-text-secondary"
                )}
              >
                {Icone === "eva" ? (
                  <MarcaEva size={16} title="Usa IA" />
                ) : Icone === "n8n" ? (
                  <LogoOficial marca="n8n" tamanho={19} titulo="Usa n8n" />
                ) : (
                  <Icone size={15} aria-hidden="true" />
                )}
              </span>
              {/* Clicar no nome abre a ordem completa dos blocos antes de aplicar. */}
              <button type="button" onClick={() => setAberto(tpl)} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[10px] text-left">
                <span className="truncate text-body font-medium text-text-primary hover:underline">{tpl.name}</span>
                <span className="truncate text-small text-text-tertiary xl:line-clamp-2 xl:whitespace-normal">
                  {foiAplicado && <span className="font-medium text-success">Aplicado · </span>}
                  {tpl.description} · <span className="font-mono tabular-nums">{nodes.length}</span> blocos
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-2">
                {foiAplicado ? (
                  <Link href={`/agent-studio/${agentId}/builder`} className="inline-flex items-center gap-1 text-small font-medium text-accent-fg hover:underline">
                    Abrir o builder <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ) : (
                  <Button type="button" variant="secondary" size="sm" disabled={!agentId || aplicando === tpl.id} onClick={() => setAberto(tpl)}>
                    {aplicando === tpl.id && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                    Aplicar
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Confirmação: os blocos na ordem em que o modelo cria e o aviso, com o agente nomeado. */}
      <Modal open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <ModalContent
          size="md"
          title={aberto ? `Aplicar “${aberto.name}”?` : undefined}
          description={aberto?.description}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setAberto(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" disabled={!agentId || !aberto} onClick={() => aberto && void aplicar(aberto.id)}>
                Aplicar em {agenteNome ?? "este agente"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 px-5 pb-2">
            <p className="font-mono text-caption text-text-tertiary">{blocosDoAberto.length} blocos, nesta ordem</p>
            <ol className="flex flex-wrap items-center gap-1.5">
              {blocosDoAberto.map((n, i) => {
                const k = n.data.iconKey as IconKey;
                return (
                  <li key={n.id} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight size={12} aria-hidden="true" className="text-text-tertiary" />}
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-raised pl-1 pr-2.5 text-small text-text-primary">
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", seloDoBloco(k))}>
                        <IconeDoBloco iconKey={k} size={11} />
                      </span>
                      {String(n.data.label ?? "")}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Notice tone="warning">
              Aplicar troca o fluxo atual de {agenteNome ?? "este agente"} e não dá para desfazer. Se ele já tem um fluxo montado, esse trabalho se perde.
            </Notice>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

// Biblioteca: modelos de fluxo (aplicar num agente) e modelos de e-mail
// (usados no bloco de e-mail do fluxo, nas réguas e nos disparos). A aba fica
// na URL para dar para mandar o link.
export default function BibliotecaPage() {
  const router = useRouter();
  const pathname = usePathname();
  const aba = useSearchParams().get("aba") === "emails" ? "emails" : "fluxos";
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState("");
  const [qtdEmails, setQtdEmails] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  // Contagem da aba E-mails antes de abri-la (a lista atualiza depois de salvar/excluir).
  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/email/modelos")
      .then((r) => r.json())
      .catch(() => ({ modelos: [] }))
      .then((d) => vivo && setQtdEmails((q) => q ?? (d.modelos ?? []).length));
    return () => {
      vivo = false;
    };
  }, []);

  const agente = agents.find((a) => a.id === agentId);
  const abas = [
    { id: "fluxos" as const, rotulo: "Fluxos", Icone: Workflow, qtd: FLOW_TEMPLATES.length },
    { id: "emails" as const, rotulo: "E-mails", Icone: Mail, qtd: qtdEmails },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra: título e, só nos fluxos, o agente em que o modelo é aplicado. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Biblioteca</h1>
        {aba === "fluxos" && agents.length > 0 && (
          <>
            <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
            <span className="text-small text-text-tertiary">Aplicar em</span>
            <SeletorDeAgente agentes={agents} agentId={agentId} onChange={setAgentId} rotulo="Aplicar em" />
          </>
        )}
      </div>

      {/* Abas em cápsula, com a contagem de cada uma. */}
      <div role="tablist" aria-label="Biblioteca" className="inline-flex h-8 w-fit items-center rounded-full border border-border-subtle bg-raised p-0.5">
        {abas.map((a) => {
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => router.replace(`${pathname}?aba=${a.id}`)}
              className={cn(
                "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-small transition-colors",
                ativa ? "bg-inverse font-medium text-inverse-fg" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <a.Icone size={13} aria-hidden="true" />
              {a.rotulo}
              {a.qtd !== null && <span className={cn("font-mono text-caption tabular-nums", ativa ? "opacity-60" : "text-text-tertiary")}>{a.qtd}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1">
        {aba === "fluxos" ? (
          <ModelosDeFluxo agentId={agentId} agenteNome={agente?.name} semAgentes={isLoaded && agents.length === 0} />
        ) : (
          <ModelosDeEmail aoContar={setQtdEmails} />
        )}
      </div>
    </div>
  );
}
